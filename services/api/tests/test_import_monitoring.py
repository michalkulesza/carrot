import uuid

import pytest
import sentry_sdk
from sentry_sdk.transport import Transport

from api.services import monitoring


class RecordingScope:
    def __init__(self, captured):
        self.captured = captured

    def set_tag(self, key, value):
        self.captured.setdefault("tags", {})[key] = value

    def set_context(self, key, value):
        self.captured[key] = value

    def set_user(self, value):
        self.captured["user"] = value

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def _capture(monkeypatch):
    captured = {}
    monkeypatch.setattr(monitoring.sentry_sdk, "new_scope", lambda: RecordingScope(captured))
    monkeypatch.setattr(monitoring.sentry_sdk, "capture_message", lambda message, level: captured.update(message=message, level=level))
    return captured


def test_missing_critical_fields_emits_redacted_final_event(monkeypatch, production_sentry):
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
        "source_url": "https://example.com/private/path",
        "final_outcome": "incomplete",
        "failure_stage": "complete",
        "renderer_status": "raw_fallback",
        "fallback_status": "complete",
    }
    assert "secret" not in str(captured)


def test_complete_and_no_recipe_content_do_not_emit_missing_field_event(monkeypatch, production_sentry):
    captured = _capture(monkeypatch)

    monitoring.report_missing_critical_fields(
        input_kind="text", issue_codes=[], source_url=None, final_outcome="complete"
    )
    monitoring.report_missing_critical_fields(
        input_kind="text", issue_codes=[], source_url=None, final_outcome="no_recipe_content"
    )

    assert captured == {}


def test_unrecognized_diagnostic_values_are_dropped(monkeypatch, production_sentry):
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


def test_unsupported_language_failure_has_stable_redacted_context(monkeypatch, production_sentry):
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
        "trace": [],
        "retry_count": None,
        "source_url": "https://example.com/video",
        "diagnostic_error": None,
    }


def test_url_failure_context_has_path_but_no_query_or_fragment():
    context = monitoring.build_import_failure_context(
        input_kind="html", reason="no_recipe_content", failure_stage="fetch",
        source_url="https://user:pw@example.com:8443/recipes/soup?utm=secret#frag",
        summary={"trace": ["fetch:html_fetched"]}, retry_count=2, diagnostic_error="no_recipe_content",
    )

    assert context["source_url"] == "https://example.com:8443/recipes/soup"
    assert context["source_origin"] == "https://example.com:8443"
    assert context["trace"] == ["fetch:html_fetched"]
    assert context["retry_count"] == 2
    assert "secret" not in str(context) and "pw" not in str(context)


@pytest.mark.parametrize("kind", ["text", "image"])
def test_non_url_failure_context_has_no_url(kind):
    context = monitoring.build_import_failure_context(input_kind=kind, reason="invalid_input", source_url=None)

    assert context["source_url"] is None
    assert context["source_origin"] is None


def test_trace_names_are_capped():
    context = monitoring.build_import_failure_context(
        input_kind="html", reason="x", summary={"trace": [f"stage:event_{i}" for i in range(80)]},
    )

    assert len(context["trace"]) == 30
    assert context["trace"][0] == "stage:event_0"


def test_failure_report_tags_job_and_opaque_user(monkeypatch, production_sentry):
    captured = _capture(monkeypatch)
    job_id, user_id = uuid.uuid4(), uuid.uuid4()

    monitoring.report_recipe_import_failure(
        input_kind="text", reason="invalid_input", job_id=job_id, job_kind="text", user_id=user_id,
    )

    assert captured["tags"]["job_id"] == str(job_id)
    assert captured["tags"]["job_kind"] == "text"
    assert captured["user"] == {"id": str(user_id)}


class _RecordingTransport(Transport):
    def __init__(self):
        super().__init__()
        self.events = []

    def capture_envelope(self, envelope):
        for item in envelope.items:
            if item.type == "event":
                self.events.append(item.payload.json)


def test_job_scopes_do_not_share_breadcrumbs_tags_user_or_trace(production_sentry):
    transport = _RecordingTransport()
    client = sentry_sdk.Client(dsn="https://public@example.com/1", transport=transport, default_integrations=False)
    first_job, second_job = uuid.uuid4(), uuid.uuid4()
    with sentry_sdk.isolation_scope() as outer:
        outer.set_client(client)
        outer.set_transaction_name("embeddings gemini-embedding-2")

        with monitoring.job_sentry_scope("recipe_import", job_id=first_job, job_kind="url", user_id=uuid.uuid4()):
            sentry_sdk.add_breadcrumb(message="first-job-crumb")
            sentry_sdk.set_tag("leak", "yes")
            sentry_sdk.capture_message("first")

        with monitoring.job_sentry_scope("recipe_import", job_id=second_job, job_kind="text"):
            sentry_sdk.capture_message("second")
    client.close()

    first, second = transport.events
    assert first["transaction"] == second["transaction"] == "recipe_import"
    assert first["tags"]["job_id"] == str(first_job)
    assert first["breadcrumbs"]["values"][-1]["message"] == "first-job-crumb"
    assert second["tags"] == {"job_id": str(second_job), "job_kind": "text"}
    assert not second.get("breadcrumbs", {}).get("values")
    assert "user" not in second
    assert first["contexts"]["trace"]["trace_id"] != second["contexts"]["trace"]["trace_id"]
