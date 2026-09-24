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


def report_recipe_import_failure(
    *,
    input_kind: str,
    reason: str,
    source_url: str | None = None,
    input_size: int | None = None,
    error: Exception | None = None,
) -> None:
    """Report a terminal import failure without sending pasted recipe contents."""
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("operation", "recipe_import")
        scope.set_tag("input_kind", input_kind)
        scope.set_context("recipe_import", {
            "source_url": _sanitize_source_url(source_url),
            "input_size": input_size,
            "reason": reason,
        })
        if error is not None:
            sentry_sdk.capture_exception(error)
        else:
            sentry_sdk.capture_message(f"Recipe import failed: {reason}", level="error")


def report_missing_source_fields(*, recipe, source_kind: str, source_url: str | None, renderer_status: str) -> None:
    """Report extraction gaps before enrichment can fill missing source facts."""
    nutrition = recipe.nutrition
    missing = [
        name for name, present in (
            ("total_time", bool(recipe.total_time_minutes or recipe.total_time_text)),
            ("servings", bool(recipe.yield_servings or recipe.yield_text)),
            ("calories", bool(nutrition.calories)),
            ("protein", bool(nutrition.protein)),
            ("fat", bool(nutrition.fat)),
            ("carbohydrates", bool(nutrition.carbohydrates)),
        ) if not present
    ]
    if not missing:
        return
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("operation", "recipe_import_source_fields")
        scope.set_context("recipe_import", {
            "missing_fields": missing,
            "source_kind": source_kind,
            "source_url": _sanitize_source_url(source_url),
            "renderer_status": renderer_status,
        })
        sentry_sdk.capture_message("Recipe extraction missing source fields", level="info")
