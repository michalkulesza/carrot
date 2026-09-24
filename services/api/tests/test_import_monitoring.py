from types import SimpleNamespace

from api.services import monitoring
from api.services.extraction_v2.contracts import ExtractedRecipe, NutritionEvidence


def test_missing_source_fields_sentry_context_contains_only_redacted_metadata(monkeypatch):
    captured = {}

    class Scope:
        def set_tag(self, key, value):
            captured.setdefault("tags", {})[key] = value

        def set_context(self, key, value):
            captured[key] = value

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(monitoring.sentry_sdk, "new_scope", lambda: Scope())
    monkeypatch.setattr(monitoring.sentry_sdk, "capture_message", lambda message, level: captured.update(message=message, level=level))
    recipe = ExtractedRecipe(nutrition=NutritionEvidence(calories="secret recipe text"))

    monitoring.report_missing_source_fields(
        recipe=recipe,
        source_kind="html",
        source_url="https://user:password@example.com/private/path?token=secret#part",
        renderer_status="raw_fallback",
    )

    assert captured["level"] == "info"
    assert captured["recipe_import"] == {
        "missing_fields": ["total_time", "servings", "protein", "fat", "carbohydrates"],
        "source_kind": "html",
        "source_url": "https://example.com",
        "renderer_status": "raw_fallback",
    }
    assert "secret" not in str(captured)


def test_complete_source_facts_do_not_emit_missing_field_event(monkeypatch):
    messages = []
    monkeypatch.setattr(monitoring.sentry_sdk, "new_scope", lambda: SimpleNamespace(
        __enter__=lambda self: self,
        __exit__=lambda self, *_args: False,
    ))
    monkeypatch.setattr(monitoring.sentry_sdk, "capture_message", lambda *args, **kwargs: messages.append(args))
    recipe = ExtractedRecipe(
        yield_servings="4",
        total_time_minutes=30,
        nutrition=NutritionEvidence(calories="100", protein="10g", fat="2g", carbohydrates="20g"),
    )

    monitoring.report_missing_source_fields(recipe=recipe, source_kind="html", source_url="https://example.com", renderer_status="rendered")

    assert messages == []
