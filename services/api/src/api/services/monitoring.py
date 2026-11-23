import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager

import sentry_sdk
import sentry_sdk.logger as sentry_logger
from urllib.parse import urlsplit, urlunsplit

from api.config import settings


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


def init_sentry() -> None:
    """Enable Sentry only when a DSN has been configured."""
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.sentry_environment,
            traces_sample_rate=0,
            enable_logs=True,
        )


def report_service_failure(
    operation: str, *, status_code: int | None = None, error: Exception | None = None,
) -> None:
    """Report handled failures without provider bodies, tokens, or user content."""
    error_type = type(error).__name__ if error is not None else None
    reason = str(status_code) if status_code is not None else (error_type or "unknown")
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("operation", operation)
        scope.fingerprint = ["service_failure", operation, reason]
        scope.set_context("service_failure", {
            "status_code": status_code,
            "error_type": error_type,
        })
        sentry_sdk.capture_message(f"Service failure: {operation}", level="error")


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
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("egress", "residential")
        scope.set_tag("step", step)
        scope.set_tag("outcome", outcome)
        scope.set_tag("host", host)
        scope.fingerprint = ["residential-egress", kind]
        sentry_sdk.capture_message(f"Residential egress {kind}", level="error")


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
    with sentry_sdk.new_scope() as scope:
        apply_job_identity(scope, job_id=job_id, job_kind=job_kind, user_id=user_id)
        scope.set_tag("operation", "recipe_import")
        scope.set_tag("input_kind", input_kind)
        scope.set_tag("reason", str(reason))
        if residential_step:
            scope.set_tag("egress", "residential")
            scope.set_tag("residential_step", residential_step)
        scope.set_context("recipe_import", build_import_failure_context(
            input_kind=input_kind, reason=reason, source_url=source_url, input_size=input_size,
            failure_stage=failure_stage, source_kind=source_kind, summary=summary,
            retry_count=retry_count, diagnostic_error=diagnostic_error,
        ))
        scope.fingerprint = ["recipe_import_failure", str(reason)]
        if error is not None:
            sentry_sdk.capture_exception(error)
        else:
            sentry_sdk.capture_message(f"Recipe import failed: {reason}", level="error")


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
    with sentry_sdk.new_scope() as scope:
        apply_job_identity(scope, job_id=job_id, job_kind=job_kind, user_id=user_id)
        scope.set_tag("event_type", "recipe_import_missing_critical_fields")
        scope.set_tag("input_kind", input_kind)
        scope.set_tag("issue_code", ",".join(missing))
        if source_kind:
            scope.set_tag("source_kind", source_kind)
        scope.fingerprint = ["recipe_import_missing_critical_fields", *missing]
        scope.set_context("recipe_import", {
            "issue_codes": missing,
            "input_kind": input_kind,
            "source_kind": source_kind or input_kind,
            "source_origin": _sanitize_source_url(source_url),
            "source_url": _sanitize_source_path_url(source_url),
            "final_outcome": final_outcome,
            "failure_stage": failure_stage,
            "renderer_status": renderer_status if renderer_status in {"rendered", "raw_fallback", "not_applicable", "failed", "partial"} else None,
            "fallback_status": fallback_status if fallback_status in {"complete", "partial", "failed", "not_applicable"} else None,
        })
        sentry_sdk.capture_message("Recipe import missing critical fields", level="warning")
