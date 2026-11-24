import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from api.broadcaster import broadcaster
from api.routes import events
from api.routes.context import get_scope_key


def _parse(frame: str) -> dict:
    data_line = next(line for line in frame.splitlines() if line.startswith("data: "))
    return json.loads(data_line[len("data: "):])


async def _open_stream(monkeypatch, poll=None):
    user = SimpleNamespace(id=uuid4())
    household_id = uuid4()
    session = AsyncMock()
    request = AsyncMock()
    request.is_disconnected.return_value = False

    async def fake_items(*_args):
        return [{"id": "item"}]

    async def fake_import_snapshot(*_args):
        return 7, [{"id": "job"}]

    async def fake_poll(_household, _user, cursor):
        if poll is not None:
            return await poll(cursor)
        await asyncio.sleep(3600)

    monkeypatch.setattr(events, "shopping_list_snapshot", fake_items)
    monkeypatch.setattr(events, "import_jobs_snapshot", fake_import_snapshot)
    monkeypatch.setattr(events, "poll_import_events", fake_poll)

    response = await events.stream_events(
        request=request, last_event_id=None, user=user, session=session, household_id=household_id,
    )
    return response, session, user, household_id


@pytest.mark.asyncio
async def test_stream_releases_session_and_sends_snapshots_first(monkeypatch) -> None:
    response, session, _user, _household = await _open_stream(monkeypatch)
    session.close.assert_awaited_once()

    frames = [await response.body_iterator.__anext__() for _ in range(3)]
    await response.body_iterator.aclose()

    assert _parse(frames[0]) == {"type": "list_snapshot", "items": [{"id": "item"}], "channel": "shoppingList"}
    assert _parse(frames[1])["type"] == "presence"
    assert _parse(frames[2]) == {"event": "import_jobs.snapshot", "jobs": [{"id": "job"}], "channel": "importJobs"}
    assert frames[2].startswith("id: 7\n")
    assert not frames[0].startswith("id:")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("prefix", "channel"),
    [("recipes", "recipes"), ("meal-plan", "mealPlan"), ("shopping-list", "shoppingList")],
)
async def test_broadcast_events_carry_channel(monkeypatch, prefix, channel) -> None:
    response, _session, user, household_id = await _open_stream(monkeypatch)
    stream = response.body_iterator
    for _ in range(3):
        await stream.__anext__()

    next_frame = asyncio.ensure_future(stream.__anext__())
    await asyncio.sleep(0.05)
    await broadcaster.publish(get_scope_key(prefix, user.id, household_id), {"type": "recipe_changed", "id": "r1"})
    frame = await asyncio.wait_for(next_frame, timeout=2)
    await stream.aclose()

    assert _parse(frame) == {"type": "recipe_changed", "id": "r1", "channel": channel}


@pytest.mark.asyncio
async def test_import_events_have_ids_and_event_name(monkeypatch) -> None:
    calls = 0

    async def poll(cursor):
        nonlocal calls
        calls += 1
        if calls == 1:
            return 9, [(9, "import_job.updated", {"id": "job"})]
        await asyncio.sleep(3600)

    response, _session, _user, _household = await _open_stream(monkeypatch, poll)
    stream = response.body_iterator
    for _ in range(3):
        await stream.__anext__()
    frame = await asyncio.wait_for(stream.__anext__(), timeout=2)
    await stream.aclose()

    assert frame.startswith("id: 9\n")
    assert _parse(frame) == {"id": "job", "event": "import_job.updated", "channel": "importJobs"}


@pytest.mark.asyncio
async def test_cleanup_unsubscribes_all_queues(monkeypatch) -> None:
    response, _session, user, household_id = await _open_stream(monkeypatch)
    stream = response.body_iterator
    for _ in range(3):
        await stream.__anext__()
    next_frame = asyncio.ensure_future(stream.__anext__())
    await asyncio.sleep(0.05)

    scopes = [get_scope_key(prefix, user.id, household_id) for prefix in ("recipes", "meal-plan", "shopping-list")]
    assert all(len(broadcaster._subs[scope]) == 1 for scope in scopes)

    next_frame.cancel()
    await asyncio.gather(next_frame, return_exceptions=True)
    await stream.aclose()

    assert all(len(broadcaster._subs[scope]) == 0 for scope in scopes)
