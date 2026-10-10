import re
from typing import Any

_UNSAFE_CHARS = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\ud800-\udfff]")
_TEXT_FIELDS = ("title", "source_title", "overview", "notes", "creator_handle")


def sanitize_text(value: str) -> str:
    """Drop control characters (keeping newline, carriage return, tab) and lone surrogates."""
    return _UNSAFE_CHARS.sub("", value)


def sanitize_value(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_text(value)
    if isinstance(value, list):
        return [sanitize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_value(item) for key, item in value.items()}
    return value


def sanitized_fields(recipe: Any) -> dict[str, Any]:
    """Cleaned values for the recipe's text fields and components that contain unsafe characters."""
    cleaned = {field: sanitize_value(getattr(recipe, field)) for field in (*_TEXT_FIELDS, "components")}
    return {field: value for field, value in cleaned.items() if value != getattr(recipe, field)}


def sanitize_recipe(recipe: Any) -> None:
    for field, value in sanitized_fields(recipe).items():
        setattr(recipe, field, value)
