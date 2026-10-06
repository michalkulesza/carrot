import sentry_sdk
from urllib.parse import urlsplit, urlunsplit

from api.config import settings


def _sanitize_source_url(source_url: str | None) -> str | None:
    if not source_url:
        return None
    parsed = urlsplit(source_url)
    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port else ""
    return urlunsplit((parsed.scheme, f"{host}{port}", "", "", ""))


def init_sentry() -> None:
    """Enable Sentry only when a DSN has been configured."""
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.sentry_environment,
            traces_sample_rate=0,
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


def report_recipe_import_failure(
    *,
    input_kind: str,
    reason: str,
    source_url: str | None = None,
    input_size: int | None = None,
    failure_stage: str | None = None,
    source_kind: str | None = None,
    error: Exception | None = None,
) -> None:
    """Report a terminal import failure without sending pasted recipe contents."""
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("operation", "recipe_import")
        scope.set_tag("input_kind", input_kind)
        scope.set_tag("reason", str(reason))
        scope.set_context("recipe_import", {
            "source_origin": _sanitize_source_url(source_url),
            "input_size": input_size,
            "reason": str(reason),
            "failure_stage": failure_stage,
            "source_kind": source_kind or input_kind,
        })
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
) -> None:
    """Report final recipe gaps using only bounded, allowlisted import metadata."""
    missing = sorted({code for code in issue_codes if code in {"MISSING_INGREDIENTS", "MISSING_INSTRUCTIONS"}})
    if not missing:
        return
    with sentry_sdk.new_scope() as scope:
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
            "final_outcome": final_outcome,
            "failure_stage": failure_stage,
            "renderer_status": renderer_status if renderer_status in {"rendered", "raw_fallback", "not_applicable", "failed", "partial"} else None,
            "fallback_status": fallback_status if fallback_status in {"complete", "partial", "failed", "not_applicable"} else None,
        })
        sentry_sdk.capture_message("Recipe import missing critical fields", level="warning")
