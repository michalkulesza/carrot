import json
import types
import uuid
from datetime import datetime

import httpx
import pytest

from api.config import settings
from api.models import ImportFailureCode, ImportJobStatus
from api.services import apns, import_worker, push


class FakeSession:
    def __init__(self, subscriptions=(), language="en", prior_failed=False):
        self.subscriptions = list(subscriptions)
        self.language = language
        self.prior_failed = prior_failed
        self.executed = []

    async def scalars(self, _query):
        return types.SimpleNamespace(all=lambda: self.subscriptions)

    async def scalar(self, query):
        if "user_preferences" in str(query):
            return self.language
        return 1 if self.prior_failed else None

    async def execute(self, statement):
        self.executed.append(statement)


def _subscription(token="tok"):
    return types.SimpleNamespace(id=uuid.uuid4(), token=token)


@pytest.fixture
def capture_apns(monkeypatch):
    sent = []

    async def post(self, url, content, headers):
        sent.append({"url": url, "payload": json.loads(content), "headers": headers})
        return httpx.Response(200)

    monkeypatch.setattr(settings, "apns_key_p8", "k")
    monkeypatch.setattr(settings, "apns_key_id", "k")
    monkeypatch.setattr(settings, "apns_team_id", "t")
    monkeypatch.setattr(apns, "_make_jwt", lambda: "jwt")
    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    monkeypatch.setattr(apns, "_client", None)
    return sent


@pytest.mark.asyncio
async def test_alert_sets_collapse_and_thread_headers(capture_apns):
    result = await apns.send_alert("dev", "t", "b", {"type": "x"}, collapse_id="import:1", thread_id="imports")

    assert result == apns.PushResult.SENT
    assert capture_apns[0]["headers"]["apns-collapse-id"] == "import:1"
    assert capture_apns[0]["headers"]["apns-push-type"] == "alert"
    assert capture_apns[0]["payload"]["aps"]["thread-id"] == "imports"
    assert capture_apns[0]["payload"]["type"] == "x"


@pytest.mark.asyncio
async def test_background_push_shape(capture_apns):
    await apns.send_background("dev", {"type": "retract", "collapse_id": "import:1"})

    sent = capture_apns[0]
    assert sent["headers"]["apns-push-type"] == "background"
    assert sent["headers"]["apns-priority"] == "5"
    assert sent["payload"] == {"aps": {"content-available": 1}, "type": "retract", "collapse_id": "import:1"}


def test_long_collapse_id_is_shortened_for_header():
    collapse_id = f"left:{uuid.uuid4()}:{uuid.uuid4()}"

    header = apns.header_collapse_id(collapse_id)

    assert len(header.encode()) <= 64
    assert header == apns.header_collapse_id(collapse_id)
    assert apns.header_collapse_id("import:1") == "import:1"


@pytest.mark.asyncio
@pytest.mark.parametrize("status,body,expected", [
    (410, {"reason": "Unregistered"}, apns.PushResult.DEAD_TOKEN),
    (400, {"reason": "BadDeviceToken"}, apns.PushResult.DEAD_TOKEN),
    (500, {"reason": "InternalServerError"}, apns.PushResult.FAILED),
])
async def test_status_classification(monkeypatch, capture_apns, status, body, expected):
    async def post(self, url, content, headers):
        return httpx.Response(status, json=body)

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    monkeypatch.setattr(apns, "report_service_failure", lambda *a, **k: None)

    assert await apns.send_alert("dev", "t", "b") == expected


@pytest.mark.asyncio
async def test_notify_user_adds_contract_fields_and_localizes(monkeypatch):
    calls = []

    async def send_alert(token, title, body, data, *, collapse_id, thread_id):
        calls.append((token, title, body, data, collapse_id, thread_id))
        return apns.PushResult.SENT

    monkeypatch.setattr(push.apns_svc, "send_alert", send_alert)
    session = FakeSession([_subscription("a")], language="pl")

    outcome = await push.notify_user(
        session, uuid.uuid4(), kind="member_left", title_key="member_left_title", body_key="member_left_body",
        params={"name": "Ann", "household": "Home"}, data={"household_id": "h"}, collapse_id="left:h:u", thread_id="household",
    )

    token, title, body, data, collapse_id, thread_id = calls[0]
    assert outcome.sent == 1
    assert title == "Członek odszedł" and "Ann" in body
    assert data == {"household_id": "h", "type": "member_left", "collapse_id": "left:h:u"}
    assert (collapse_id, thread_id) == ("left:h:u", "household")


def test_localization_falls_back_to_english():
    assert push.localize("import_failed_title", "xx") == "Couldn't add recipe"
    assert push.localize("import_failed_title", None) == "Couldn't add recipe"
    assert push.localize("member_left_body", "de", {"name": "A", "household": "B"}) == "A hat B verlassen."


@pytest.mark.asyncio
async def test_dead_tokens_are_pruned(monkeypatch):
    async def send_alert(token, *args, **kwargs):
        return apns.PushResult.DEAD_TOKEN if token == "dead" else apns.PushResult.SENT

    monkeypatch.setattr(push.apns_svc, "send_alert", send_alert)
    session = FakeSession([_subscription("dead"), _subscription("live")])

    outcome = await push.notify_user(
        session, uuid.uuid4(), kind="k", title_key="import_failed_title", body_key="import_failed_body",
        collapse_id="import:1", thread_id="imports",
    )

    assert outcome.sent == 1
    assert len(session.executed) == 1
    assert "DELETE" in str(session.executed[0])


@pytest.mark.asyncio
async def test_retract_sends_background_payload(monkeypatch):
    calls = []

    async def send_background(token, data):
        calls.append(data)
        return apns.PushResult.SENT

    monkeypatch.setattr(push.apns_svc, "send_background", send_background)

    await push.retract(FakeSession([_subscription()]), uuid.uuid4(), collapse_id="invite:9")

    assert calls == [{"type": "retract", "collapse_id": "invite:9"}]


def test_all_failures_trigger_retry_but_partial_success_does_not():
    assert push.DeliveryOutcome(sent=0, failed=2).should_retry
    assert not push.DeliveryOutcome(sent=1, failed=1).should_retry
    assert not push.DeliveryOutcome().should_retry


def _event(event_type, payload=None):
    return types.SimpleNamespace(
        id=5, job_id=uuid.uuid4(), user_id=uuid.uuid4(), type=event_type, payload=payload or {},
        created_at=datetime.utcnow(),
    )


def _job(status=ImportJobStatus.FAILED, parent=None, dismissed_at=None):
    return types.SimpleNamespace(status=status, parent_recipe_id=parent, dismissed_at=dismissed_at)


@pytest.fixture
def recorded_push(monkeypatch):
    calls = {"alert": [], "retract": []}

    async def notify_user(session, user_id, **kwargs):
        calls["alert"].append(kwargs)
        return push.DeliveryOutcome(sent=1)

    async def retract(session, user_id, *, collapse_id):
        calls["retract"].append(collapse_id)
        return push.DeliveryOutcome(sent=1)

    monkeypatch.setattr(import_worker.push_svc, "notify_user", notify_user)
    monkeypatch.setattr(import_worker.push_svc, "retract", retract)
    return calls


@pytest.mark.asyncio
@pytest.mark.parametrize("event_type", ["import_job.created", "import_job.dismissed", "import_job.cancelled"])
async def test_retract_only_after_prior_failed_push(recorded_push, event_type):
    event = _event(event_type)

    await import_worker._push_for_event(FakeSession(prior_failed=False), event, _job(ImportJobStatus.PENDING))
    assert recorded_push["retract"] == []

    await import_worker._push_for_event(FakeSession(prior_failed=True), event, _job(ImportJobStatus.PENDING))
    assert recorded_push["retract"] == [f"import:{event.job_id}"]


@pytest.mark.asyncio
async def test_success_and_failure_alerts_share_collapse_id(recorded_push):
    failed = _event("import_job.failed", {"failure_code": ImportFailureCode.SOURCE_BLOCKED})
    await import_worker._push_for_event(FakeSession(), failed, _job())
    succeeded = _event("import_job.succeeded", {"result_recipe_id": "r1"})
    succeeded.job_id = failed.job_id
    await import_worker._push_for_event(FakeSession(), succeeded, _job(ImportJobStatus.SUCCEEDED))

    first, second = recorded_push["alert"]
    assert first["kind"] == "recipe_failed" and first["title_key"] == "import_user_action_title"
    assert second["kind"] == "recipe_imported" and second["data"]["recipe_id"] == "r1"
    assert first["collapse_id"] == second["collapse_id"] == f"import:{failed.job_id}"
    assert first["thread_id"] == "imports"


@pytest.mark.asyncio
async def test_child_jobs_and_stale_failures_are_not_pushed(recorded_push):
    await import_worker._push_for_event(FakeSession(prior_failed=True), _event("import_job.failed"), _job(parent=uuid.uuid4()))
    await import_worker._push_for_event(FakeSession(), _event("import_job.failed"), _job(ImportJobStatus.PENDING))
    await import_worker._push_for_event(FakeSession(), _event("import_job.failed"), _job(dismissed_at=datetime.utcnow()))

    assert recorded_push == {"alert": [], "retract": []}
