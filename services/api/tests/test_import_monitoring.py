from api.services import monitoring


class RecordingScope:
    def __init__(self, captured):
        self.captured = captured

    def set_tag(self, key, value):
        self.captured.setdefault("tags", {})[key] = value

    def set_context(self, key, value):
        self.captured[key] = value

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def _capture(monkeypatch):
    captured = {}
    monkeypatch.setattr(monitoring.sentry_sdk, "new_scope", lambda: RecordingScope(captured))
    monkeypatch.setattr(monitoring.sentry_sdk, "capture_message", lambda message, level: captured.update(message=message, level=level))
    return captured


def test_missing_critical_fields_emits_redacted_final_event(monkeypatch):
    captured = _capture(monkeypatch)

    monitoring.report_missing_critical_fields(
        input_kind="url",
        source_kind="social",
        issue_codes=["MISSING_INSTRUCTIONS", "MISSING_INSTRUCTIONS"],
        source_url="https://user:password@example.com/private/path?token=secret#part",
        final_outcome="incomplete",
        failure_stage="complete",
        renderer_status="raw_fallback",
        fallback_status="complete",
    )

    assert captured["level"] == "warning"
    assert captured["tags"] == {
        "event_type": "recipe_import_missing_critical_fields",
        "input_kind": "url",
        "issue_code": "MISSING_INSTRUCTIONS",
        "source_kind": "social",
    }
    assert captured["recipe_import"] == {
        "issue_codes": ["MISSING_INSTRUCTIONS"],
        "input_kind": "url",
        "source_kind": "social",
        "source_origin": "https://example.com",
        "final_outcome": "incomplete",
        "failure_stage": "complete",
        "renderer_status": "raw_fallback",
        "fallback_status": "complete",
    }
    assert "secret" not in str(captured)


def test_complete_and_no_recipe_content_do_not_emit_missing_field_event(monkeypatch):
    captured = _capture(monkeypatch)

    monitoring.report_missing_critical_fields(
        input_kind="text", issue_codes=[], source_url=None, final_outcome="complete"
    )
    monitoring.report_missing_critical_fields(
        input_kind="text", issue_codes=[], source_url=None, final_outcome="no_recipe_content"
    )

    assert captured == {}


def test_unrecognized_diagnostic_values_are_dropped(monkeypatch):
    captured = _capture(monkeypatch)

    monitoring.report_missing_critical_fields(
        input_kind="image",
        issue_codes=["MISSING_INGREDIENTS"],
        final_outcome="complete",
        failure_stage="stage with private prompt",
        renderer_status="exception with secret",
        fallback_status="caption: private text",
    )

    context = captured["recipe_import"]
    assert context["failure_stage"] == "stage with private prompt"
    assert context["renderer_status"] is None
    assert context["fallback_status"] is None


def test_unsupported_language_failure_has_stable_redacted_context(monkeypatch):
    captured = _capture(monkeypatch)

    monitoring.report_recipe_import_failure(
        input_kind="url",
        source_kind="social",
        source_url="https://example.com/video?id=private",
        reason="unsupported_language",
        failure_stage="language",
    )

    assert captured["tags"] == {"operation": "recipe_import", "input_kind": "url", "reason": "unsupported_language"}
    assert captured["recipe_import"] == {
        "source_origin": "https://example.com",
        "input_size": None,
        "reason": "unsupported_language",
        "failure_stage": "language",
        "source_kind": "social",
    }
