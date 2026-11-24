import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.broadcaster import broadcaster
from api.database import get_async_session
from api.import_event_notifier import import_event_notifier
from api.routes.context import get_active_household_id, get_scope_key
from api.routes.imports import import_jobs_snapshot, poll_import_events, resume_cursor
from api.routes.shopping_list import shopping_list_scope, shopping_list_snapshot
from api.users import User, current_active_user

router = APIRouter(tags=["events"])

HEARTBEAT_SECONDS = 15.0
IMPORT_POLL_SECONDS = 15.0


def _frame(channel: str, payload: dict, event_id: int | None = None) -> str:
    id_line = f"id: {event_id}\n" if event_id is not None else ""
    return f"{id_line}data: {json.dumps({**payload, 'channel': channel}, default=str)}\n\n"


async def _forward_broadcast(channel: str, scope: str, out: asyncio.Queue) -> None:
    queue = await broadcaster.subscribe(scope)
    try:
        while True:
            await out.put(_frame(channel, await queue.get()))
    finally:
        broadcaster.unsubscribe(scope, queue)


async def _poll_import_jobs(household_id: uuid.UUID, user_id: uuid.UUID, cursor: int, out: asyncio.Queue) -> None:
    while True:
        generation = import_event_notifier.generation
        cursor, events = await poll_import_events(household_id, user_id, cursor)
        for event_id, event_type, payload in events:
            await out.put(_frame("importJobs", {**payload, "event": event_type}, event_id))
        if not events:
            await import_event_notifier.wait(generation, timeout=IMPORT_POLL_SECONDS)


@router.get("/events")
async def stream_events(
    request: Request,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> StreamingResponse:
    shopping_scope = shopping_list_scope(user.id, household_id)
    shopping_items = await shopping_list_snapshot(session, user.id, household_id)
    shopping_presence = broadcaster.get_presence(shopping_scope)
    watermark, import_snapshot = await import_jobs_snapshot(session, household_id, user.id)
    await session.commit()
    await session.close()

    cursor = resume_cursor(last_event_id, watermark)
    scopes = {
        "recipes": get_scope_key("recipes", user.id, household_id),
        "mealPlan": get_scope_key("meal-plan", user.id, household_id),
        "shoppingList": shopping_scope,
    }

    async def event_gen():
        yield _frame("shoppingList", {"type": "list_snapshot", "items": shopping_items})
        yield _frame("shoppingList", {"type": "presence", "users": shopping_presence})
        yield _frame("importJobs", {"event": "import_jobs.snapshot", "jobs": import_snapshot}, watermark)

        out: asyncio.Queue = asyncio.Queue()
        tasks = [asyncio.create_task(_forward_broadcast(channel, scope, out)) for channel, scope in scopes.items()]
        tasks.append(asyncio.create_task(_poll_import_jobs(household_id, user.id, cursor, out)))
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    yield await asyncio.wait_for(out.get(), timeout=HEARTBEAT_SECONDS)
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
