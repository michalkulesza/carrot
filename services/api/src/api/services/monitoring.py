import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager

import sentry_sdk
import sentry_sdk.logger as sentry_logger
from urllib.parse import urlsplit, urlunsplit

from api.config import settings

log = logging.getLogger(__name__)


def _sanitize_source_url(source_url: str | None) -> str | None:
    if not source_url:
        return None
    parsed = urlsplit(source_url)
    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    return urlunsplit((parsed.scheme, f"{host}{port}", "", "", ""))


def _sanitize_source_path_url(source_url: str | None) -> str | None:
    if not source_url:
        return None
    parsed = urlsplit(source_url)
    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    return urlunsplit((parsed.scheme, f"{host}{port}", parsed.path, "", ""))


_MAX_TRACE_NAMES = 30


def apply_job_identity(scope, *, job_id: uuid.UUID | None, job_kind: str | None, user_id: uuid.UUID | None) -> None:
    if job_id is not None:
        scope.set_tag("job_id", str(job_id))
    if job_kind:
        scope.set_tag("job_kind", str(job_kind))
    if user_id is not None:
        scope.set_user({"id": str(user_id)})


@contextmanager
def job_sentry_scope(
    transaction_name: str, *, job_id: uuid.UUID | None = None, job_kind: str | None = None, user_id: uuid.UUID | None = None,
) -> Iterator[None]:
    """Give one queue item its own breadcrumbs, tags, user, trace id and transaction name."""
    with sentry_sdk.isolation_scope() as scope:
        scope.clear_breadcrumbs()
        scope.set_new_propagation_context()
        scope.set_transaction_name(transaction_name)
        apply_job_identity(scope, job_id=job_id, job_kind=job_kind, user_id=user_id)
        yield


def build_import_failure_context(
    *,
    input_kind: str,
    reason: str,
    source_url: str | None = None,
    input_size: int | None = None,
    failure_stage: str | None = None,
    source_kind: str | None = None,
    summary: dict | None = None,
    retry_count: int | None = None,
    diagnostic_error: str | None = None,
) -> dict:
    """Names, counts and statuses only; callers pass source_url solely for URL jobs. diagnostic_error is a failure code or exception type name."""
    summary = summary or {}
    trace_names = [str(name) for name in summary.get("trace", [])][:_MAX_TRACE_NAMES]
    context = {
        "source_origin": _sanitize_source_url(source_url),
        "input_size": input_size,
        "reason": str(reason),
        "failure_stage": failure_stage,
        "source_kind": source_kind or input_kind,
        "trace": trace_names,
        "retry_count": retry_count,
        "source_url": _sanitize_source_path_url(source_url),
        "diagnostic_error": diagnostic_error,
    }
    for key in ("ingredient_count", "step_count", "renderer_status", "fallback_status"):
        if summary.get(key) is not None:
            context[key] = summary[key]
    return context


def sentry_enabled() -> bool:
    return bool(settings.sentry_dsn) and settings.sentry_environment == "production"


def init_sentry() -> None:
    """Enable Sentry only in production with a DSN, so dev and test runs stay out of the project."""
    if sentry_enabled():
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.sentry_environment,
            traces_sample_rate=0,
            enable_logs=True,
        )


def _emit(
    level: str,
    message: str,
    *,
    tags: dict[str, str],
    contexts: dict[str, dict] | None = None,
    fingerprint: list[str],
    job_id: uuid.UUID | None = None,
    job_kind: str | None = None,
    user_id: uuid.UUID | None = None,
    error: Exception | None = None,
) -> None:
    """Send to Sentry in production; elsewhere log what would have been sent."""
    contexts = contexts or {}
    if not sentry_enabled():
        identity_tags = {
            **({"job_id": str(job_id)} if job_id is not None else {}),
            **({"job_kind": str(job_kind)} if job_kind else {}),
        }
        log_at = log.error if level == "error" else log.warning
        log_at(
            "[SENTRY:DEV] %s tags=%s fingerprint=%s contexts=%s",
            message, {**identity_tags, **tags}, fingerprint, contexts,
            exc_info=error,
        )
        return

    with sentry_sdk.new_scope() as scope:
        apply_job_identity(scope, job_id=job_id, job_kind=job_kind, user_id=user_id)
        for key, value in tags.items():
            scope.set_tag(key, value)
        for key, value in contexts.items():
            scope.set_context(key, value)
        scope.fingerprint = fingerprint
        if error is not None:
            sentry_sdk.capture_exception(error)
        else:
            sentry_sdk.capture_message(message, level=level)


def report_service_failure(
    operation: str, *, status_code: int | None = None, error: Exception | None = None,
) -> None:
    """Report handled failures without provider bodies, tokens, or user content."""
    error_type = type(error).__name__ if error is not None else None
    reason = str(status_code) if status_code is not None else (error_type or "unknown")
    _emit(
        "error", f"Service failure: {operation}",
        tags={"operation": operation},
        contexts={"service_failure": {"status_code": status_code, "error_type": error_type}},
        fingerprint=["service_failure", operation, reason],
    )


def report_dependency_down(name: str, *, status_code: int | None = None, error: Exception | None = None) -> None:
    """Report one failed health-probe check without provider bodies or hosts."""
    _emit(
        "error", f"Dependency down: {name}",
        tags={"dependency": name},
        contexts={"dependency_down": {
            "error_type": type(error).__name__ if error is not None else None,
            "status_code": status_code,
        }},
        fingerprint=["dependency_down", name],
    )


def log_fetch_attempt(
    logger: logging.Logger, *, host: str, route: str, step: str, outcome: str, duration_ms: int, fallback: bool,
) -> None:
    """Mirror one page-fetch attempt to the stdlib log and Sentry Logs (no-op without a DSN)."""
    logger.info(
        "fetch_attempt route=%s step=%s outcome=%s host=%s duration_ms=%d fallback=%s",
        route, step, outcome, host, duration_ms, str(fallback).lower(),
    )
    sentry_logger.info(
        "fetch_attempt route={route} step={step} outcome={outcome} host={host}",
        route=route, step=step, outcome=outcome, host=host,
        attributes={"duration_ms": duration_ms, "fallback": fallback},
    )


def report_residential_failure(kind: str, *, step: str, outcome: str, host: str) -> None:
    """Sentry error for a failed residential request; kind is "unavailable" or "blocked". Hostname only."""
    _emit(
        "error", f"Residential egress {kind}",
        tags={"egress": "residential", "step": step, "outcome": outcome, "host": host},
        fingerprint=["residential-egress", kind],
    )


def report_recipe_import_failure(
    *,
    input_kind: str,
    reason: str,
    source_url: str | None = None,
    input_size: int | None = None,
    failure_stage: str | None = None,
    source_kind: str | None = None,
    error: Exception | None = None,
    residential_step: str | None = None,
    job_id: uuid.UUID | None = None,
    job_kind: str | None = None,
    user_id: uuid.UUID | None = None,
    summary: dict | None = None,
    retry_count: int | None = None,
    diagnostic_error: str | None = None,
) -> None:
    """Report a terminal import failure without sending pasted recipe contents."""
    tags = {"operation": "recipe_import", "input_kind": input_kind, "reason": str(reason)}
    if residential_step:
        tags["egress"] = "residential"
        tags["residential_step"] = residential_step
    context = build_import_failure_context(
        input_kind=input_kind, reason=reason, source_url=source_url, input_size=input_size,
        failure_stage=failure_stage, source_kind=source_kind, summary=summary,
        retry_count=retry_count, diagnostic_error=diagnostic_error,
    )

    _emit(
        "error", f"Recipe import failed: {reason}",
        tags=tags,
        contexts={"recipe_import": context},
        fingerprint=["recipe_import_failure", str(reason)],
        job_id=job_id, job_kind=job_kind, user_id=user_id, error=error,
    )


def report_missing_critical_fields(
    *, input_kind: str, issue_codes: list[str], source_url: str | None = None,
    final_outcome: str | None = None, failure_stage: str | None = None,
    renderer_status: str | None = None, fallback_status: str | None = None,
    source_kind: str | None = None,
    job_id: uuid.UUID | None = None,
    job_kind: str | None = None,
    user_id: uuid.UUID | None = None,
) -> None:
    """Report final recipe gaps using only bounded, allowlisted import metadata."""
    missing = sorted({code for code in issue_codes if code in {"MISSING_INGREDIENTS", "MISSING_INSTRUCTIONS"}})
    if not missing:
        return
    tags = {
        "event_type": "recipe_import_missing_critical_fields",
        "input_kind": input_kind,
        "issue_code": ",".join(missing),
    }
    if source_kind:
        tags["source_kind"] = source_kind
    renderer_known = renderer_status in {"rendered", "raw_fallback", "not_applicable", "failed", "partial"}
    fallback_known = fallback_status in {"complete", "partial", "failed", "not_applicable"}
    context = {
        "issue_codes": missing,
        "input_kind": input_kind,
        "source_kind": source_kind or input_kind,
        "source_origin": _sanitize_source_url(source_url),
        "source_url": _sanitize_source_path_url(source_url),
        "final_outcome": final_outcome,
        "failure_stage": failure_stage,
        "renderer_status": renderer_status if renderer_known else None,
        "fallback_status": fallback_status if fallback_known else None,
    }

    _emit(
        "warning", "Recipe import missing critical fields",
        tags=tags,
        contexts={"recipe_import": context},
        fingerprint=["recipe_import_missing_critical_fields", *missing],
        job_id=job_id, job_kind=job_kind, user_id=user_id,
    )
