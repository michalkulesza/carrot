import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
import sentry_sdk
from sentry_sdk.transport import Transport

from api.services import apns, email, monitoring


class RecordingTransport(Transport):
    def __init__(self):
        super().__init__()
        self.events = []

    def capture_envelope(self, envelope):
        for item in envelope.items:
            if item.type == "event":
                self.events.append(item.payload.json)


@pytest.fixture
def events():
    transport = RecordingTransport()
    client = sentry_sdk.Client(
        dsn="https://public@example.com/1",
        transport=transport,
        default_integrations=False,
    )
    with sentry_sdk.isolation_scope() as scope:
        scope.set_client(client)
        try:
            yield transport.events
        finally:
            client.close()


def mock_provider(monkeypatch, module, handler):
    client_class = httpx.AsyncClient
    monkeypatch.setattr(
        module.httpx, "AsyncClient",
        lambda **kwargs: client_class(transport=httpx.MockTransport(handler), **kwargs),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [401, 403, 429, 500])
async def test_email_provider_failure_creates_one_redacted_issue(monkeypatch, events, status):
    monkeypatch.setattr(email.settings, "resend_api_key", "private-api-key")
    monkeypatch.setattr(email.settings, "email_from", "sender@example.com")
    mock_provider(monkeypatch, email, lambda request: httpx.Response(status, text="private-provider-body"))

    await email.send_email("recipient@example.com", "private-subject", "private-html", "private-code")

    assert len(events) == 1
    event = events[0]
    assert event["level"] == "error"
    assert event["tags"]["operation"] == "email_send"
    assert event["fingerprint"] == ["service_failure", "email_send", str(status)]
    assert event["contexts"]["service_failure"]["status_code"] == status
    serialized = json.dumps(event)
    for private in ("private-api-key", "recipient@example.com", "private-subject", "private-html", "private-code", "private-provider-body"):
        assert private not in serialized


@pytest.mark.asyncio
async def test_email_network_failure_creates_issue_without_exception_contents(monkeypatch, events):
    monkeypatch.setattr(email.settings, "resend_api_key", "private-api-key")
    monkeypatch.setattr(email.settings, "email_from", "sender@example.com")

    def fail(request):
        raise httpx.ConnectError("private-error-details", request=request)

    mock_provider(monkeypatch, email, fail)
    await email.send_email("recipient@example.com", "subject", "html", "text")

    assert len(events) == 1
    assert events[0]["contexts"]["service_failure"]["error_type"] == "ConnectError"
    assert "private-error-details" not in json.dumps(events)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [200, 201])
async def test_successful_email_does_not_create_issue(monkeypatch, events, status):
    monkeypatch.setattr(email.settings, "resend_api_key", "key")
    monkeypatch.setattr(email.settings, "email_from", "sender@example.com")
    mock_provider(monkeypatch, email, lambda request: httpx.Response(status))
    await email.send_email("recipient@example.com", "subject", "html", "text")
    assert events == []


@pytest.mark.asyncio
async def test_unconfigured_email_does_not_call_provider(monkeypatch, events):
    monkeypatch.setattr(email.settings, "resend_api_key", "")
    client = Mock(side_effect=AssertionError("Provider must not be called"))
    monkeypatch.setattr(email.httpx, "AsyncClient", client)
    await email.send_email("recipient@example.com", "subject", "html", "text")
    assert events == []
    client.assert_not_called()


@pytest.mark.asyncio
async def test_push_provider_failure_creates_issue(monkeypatch, events):
    monkeypatch.setattr(apns.settings, "apns_key_p8", "key")
    monkeypatch.setattr(apns.settings, "apns_key_id", "key-id")
    monkeypatch.setattr(apns.settings, "apns_team_id", "team-id")
    monkeypatch.setattr(apns, "_make_jwt", lambda: "private-jwt")
    mock_provider(monkeypatch, apns, lambda request: httpx.Response(403, text="private-provider-body"))
    await apns.send_alert("private-device-token", "title", "body")
    assert len(events) == 1
    assert events[0]["fingerprint"] == ["service_failure", "push_send", "403"]
    assert "private-" not in json.dumps(events)


@pytest.mark.asyncio
async def test_push_signing_failure_is_reported_and_handled(monkeypatch, events):
    monkeypatch.setattr(apns.settings, "apns_key_p8", "key")
    monkeypatch.setattr(apns.settings, "apns_key_id", "key-id")
    monkeypatch.setattr(apns.settings, "apns_team_id", "team-id")
    monkeypatch.setattr(apns, "_make_jwt", Mock(side_effect=ValueError("private-key-details")))
    await apns.send_alert("device-token", "title", "body")
    assert len(events) == 1
    assert events[0]["contexts"]["service_failure"]["error_type"] == "ValueError"
    assert "private-key-details" not in json.dumps(events)


def test_handled_failures_group_by_operation_and_reason(events):
    for _ in range(2):
        monitoring.report_service_failure("semantic_search", error=RuntimeError("private-query"))
    monitoring.report_service_failure("allergen_recheck", error=RuntimeError("private-recipe"))
    assert events[0]["fingerprint"] == events[1]["fingerprint"]
    assert events[0]["fingerprint"] != events[2]["fingerprint"]
    assert "private-" not in json.dumps(events)


@pytest.mark.asyncio
@pytest.mark.parametrize("retry_count, message, terminal", [
    (0, "connection unavailable", False),
    (2, "connection unavailable", True),
    (0, "invalid embedding dimensions", True),
])
async def test_embedding_reports_terminal_failures_only(monkeypatch, events, retry_count, message, terminal):
    from api.services import import_worker

    job = SimpleNamespace(retry_count=retry_count)
    session = AsyncMock()
    session.scalar.return_value = job
    session.__aenter__.return_value = session
    monkeypatch.setattr(import_worker, "async_session_maker", lambda: session)
    monkeypatch.setattr(import_worker.settings, "embedding_retry_cap", 3)

    await import_worker._retry_embedding_job(uuid.uuid4(), RuntimeError(message))

    session.commit.assert_awaited_once()
    if terminal:
        assert job.status == import_worker.EmbeddingStatus.FAILED
        assert len(events) == 1
        assert events[0]["tags"]["operation"] == "recipe_embedding"
    else:
        assert job.status == import_worker.EmbeddingStatus.PENDING
        assert job.next_attempt_at is not None
        assert events == []


@pytest.mark.asyncio
async def test_worker_initializes_sentry_before_database_startup(monkeypatch):
    from api import worker

    initialized = Mock()
    monkeypatch.setattr(worker, "init_sentry", initialized)
    connection = AsyncMock()

    async def startup_failure():
        initialized.assert_called_once_with()
        raise RuntimeError("Database unavailable")

    connection.__aenter__.side_effect = startup_failure
    monkeypatch.setattr(worker, "engine", Mock(begin=lambda: connection))
    with pytest.raises(RuntimeError, match="Database unavailable"):
        await worker.main()
