import asyncio
import calendar as cal
import json
import re
import uuid
from datetime import date as DateType, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.broadcaster import broadcaster
from api.database import get_async_session
from api.models import (
    MealPlanAddRequest,
    MealPlanEntry,
    MealPlanEntryOut,
    MealPlanMoveRequest,
    MealPlanSetRequest,
    Recipe,
)
from api.routes.context import get_active_household_id, get_scope_key
from api.routes.recipes import _recipe_filter
from api.users import User, current_active_user

router = APIRouter(prefix="/meal-plan", tags=["meal-plan"])

_ISO_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")


def _parse_date(value: str) -> DateType:
    if _ISO_DATE_PATTERN.fullmatch(value) is None:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
    try:
        return DateType.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid date format, use YYYY-MM-DD",
        ) from None


def _entry_filter(household_id: uuid.UUID, date: DateType):
    return and_(MealPlanEntry.household_id == household_id, MealPlanEntry.date == date)


def _recipe_access_filter(household_id: uuid.UUID, recipe_id: uuid.UUID):
    return and_(Recipe.id == recipe_id, _recipe_filter(household_id))


def _entry_order():
    return (MealPlanEntry.date, MealPlanEntry.created_at, MealPlanEntry.id)


def _next_entry_statement(household_id: uuid.UUID, from_date: DateType):
    where = and_(
        MealPlanEntry.household_id == household_id,
        MealPlanEntry.date >= from_date,
    )
    return select(MealPlanEntry).where(where).order_by(*_entry_order()).limit(1)


def _dish_key(recipe_id: uuid.UUID | None, text: str | None) -> tuple[str, object]:
    if recipe_id is not None:
        return ("recipe", recipe_id)
    return ("text", (text or "").strip().lower())


def _entry_key(entry: MealPlanEntry) -> tuple[str, object]:
    return _dish_key(entry.recipe_id, entry.text)


async def _entries_on(
    session: AsyncSession, household_id: uuid.UUID, date: DateType
) -> list[MealPlanEntry]:
    result = await session.execute(
        select(MealPlanEntry)
        .where(_entry_filter(household_id, date))
        .order_by(*_entry_order())
    )
    return list(result.scalars().all())


async def _require_accessible_recipes(
    session: AsyncSession, household_id: uuid.UUID, recipe_ids: set[uuid.UUID]
) -> dict[uuid.UUID, Recipe]:
    if not recipe_ids:
        return {}
    result = await session.execute(
        select(Recipe).where(Recipe.id.in_(recipe_ids), _recipe_filter(household_id))
    )
    recipes = {recipe.id: recipe for recipe in result.scalars().all()}
    if len(recipes) != len(recipe_ids):
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipes


async def _move_entries(
    session: AsyncSession,
    household_id: uuid.UUID,
    sources: list[MealPlanEntry],
    to_date: DateType,
) -> list[MealPlanEntry]:
    target_by_key = {_entry_key(entry): entry for entry in await _entries_on(session, household_id, to_date)}

    resulting: list[MealPlanEntry] = []
    for source in sources:
        key = _entry_key(source)
        existing = target_by_key.get(key)
        if existing is not None:
            await session.delete(source)
            resulting.append(existing)
            continue
        source.date = to_date
        target_by_key[key] = source
        resulting.append(source)

    return resulting


def _next_day_statement(household_id: uuid.UUID, from_date: DateType):
    next_date = (
        select(func.min(MealPlanEntry.date))
        .where(
            MealPlanEntry.household_id == household_id,
            MealPlanEntry.date >= from_date,
        )
        .scalar_subquery()
    )
    where = and_(
        MealPlanEntry.household_id == household_id,
        MealPlanEntry.date == next_date,
    )

    return select(MealPlanEntry).where(where).order_by(*_entry_order())


async def _publish_change(
    user: User, household_id: uuid.UUID, date_str: str, to: str | None = None
) -> None:
    scope = get_scope_key("meal-plan", user.id, household_id)
    event: dict[str, str] = {"type": "meal_plan_changed", "date": date_str}
    if to is not None:
        event["to"] = to
    await broadcaster.publish(scope, event)


@router.get("", response_model=list[MealPlanEntryOut])
async def list_meal_plan(
    month: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> list[MealPlanEntryOut]:
    try:
        year, m = int(month.split("-")[0]), int(month.split("-")[1])
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid month format, use YYYY-MM")

    last_day = cal.monthrange(year, m)[1]
    start = DateType(year, m, 1)
    end = DateType(year, m, last_day)

    where = and_(
        MealPlanEntry.household_id == household_id,
        MealPlanEntry.date >= start,
        MealPlanEntry.date <= end,
    )

    result = await session.execute(
        select(MealPlanEntry).where(where).order_by(*_entry_order())
    )
    return [MealPlanEntryOut.model_validate(e) for e in result.scalars().all()]


@router.get("/next", response_model=MealPlanEntryOut | None)
async def get_next_meal_plan_entry(
    from_: str = Query(alias="from"),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> MealPlanEntryOut | None:
    from_date = _parse_date(from_)
    statement = _next_entry_statement(household_id, from_date)
    result = await session.execute(statement)
    entry = result.scalar_one_or_none()

    return MealPlanEntryOut.model_validate(entry) if entry is not None else None


@router.get("/next-day", response_model=list[MealPlanEntryOut])
async def get_next_meal_plan_day(
    from_: str = Query(alias="from"),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> list[MealPlanEntryOut]:
    from_date = _parse_date(from_)
    statement = _next_day_statement(household_id, from_date)
    result = await session.execute(statement)

    return [MealPlanEntryOut.model_validate(e) for e in result.scalars().all()]


# NOTE: /stream must be defined before /{date_str}
@router.get("/stream")
async def stream_meal_plan(
    request: Request,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> StreamingResponse:
    scope = get_scope_key("meal-plan", user.id, household_id)
    # Long-lived SSE: return the DB connection now, or open streams exhaust the pool.
    await session.close()

    async def event_gen():
        q = await broadcaster.subscribe(scope)
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            broadcaster.unsubscribe(scope, q)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{date_str}/entries", response_model=list[MealPlanEntryOut])
async def add_meal_plan_entries(
    date_str: str,
    body: MealPlanAddRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> list[MealPlanEntryOut]:
    date = _parse_date(date_str)
    recipe_ids = {item.recipe_id for item in body.items if item.recipe_id is not None}
    recipes = await _require_accessible_recipes(session, household_id, recipe_ids)

    existing = await _entries_on(session, household_id, date)
    seen = {_entry_key(entry) for entry in existing}

    base = datetime.now(timezone.utc)
    added = 0
    for item in body.items:
        key = _dish_key(item.recipe_id, item.text)
        if key in seen:
            continue
        seen.add(key)
        session.add(
            MealPlanEntry(
                user_id=user.id,
                household_id=household_id,
                date=date,
                recipe_id=item.recipe_id,
                recipe=recipes.get(item.recipe_id) if item.recipe_id is not None else None,
                text=item.text,
                created_at=base + timedelta(microseconds=added),
            )
        )
        added += 1

    if added:
        await session.commit()
        await _publish_change(user, household_id, date_str)

    entries = await _entries_on(session, household_id, date)
    return [MealPlanEntryOut.model_validate(entry) for entry in entries]


@router.delete("/entries/{entry_id}", status_code=204)
async def delete_meal_plan_entry_by_id(
    entry_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> None:
    result = await session.execute(
        select(MealPlanEntry).where(
            MealPlanEntry.id == entry_id, MealPlanEntry.household_id == household_id
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        return

    date_str = entry.date.isoformat()
    await session.delete(entry)
    await session.commit()

    await _publish_change(user, household_id, date_str)


@router.post("/entries/{entry_id}/move", response_model=MealPlanEntryOut)
async def move_meal_plan_entry_by_id(
    entry_id: uuid.UUID,
    body: MealPlanMoveRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> MealPlanEntryOut:
    to_date = _parse_date(body.to)

    result = await session.execute(
        select(MealPlanEntry).where(
            MealPlanEntry.id == entry_id, MealPlanEntry.household_id == household_id
        )
    )
    source = result.scalar_one_or_none()
    if source is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    if source.date == to_date:
        return MealPlanEntryOut.model_validate(source)

    from_str = source.date.isoformat()
    [moved] = await _move_entries(session, household_id, [source], to_date)
    await session.commit()
    await session.refresh(moved)

    await _publish_change(user, household_id, from_str, body.to)

    return MealPlanEntryOut.model_validate(moved)


@router.put("/{date_str}", response_model=MealPlanEntryOut)
async def set_meal_plan_entry(
    date_str: str,
    body: MealPlanSetRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> MealPlanEntryOut:
    date = _parse_date(date_str)
    recipes = await _require_accessible_recipes(
        session, household_id, {body.recipe_id} if body.recipe_id is not None else set()
    )
    recipe = recipes.get(body.recipe_id) if body.recipe_id is not None else None

    existing = await _entries_on(session, household_id, date)
    if not existing:
        entry = MealPlanEntry(
            user_id=user.id,
            household_id=household_id,
            date=date,
            recipe_id=body.recipe_id,
            recipe=recipe,
            text=body.text,
        )
        session.add(entry)
    else:
        entry = existing[0]
        entry.recipe_id = body.recipe_id
        entry.recipe = recipe
        entry.text = body.text
        for extra in existing[1:]:
            await session.delete(extra)

    await session.commit()
    await session.refresh(entry)

    await _publish_change(user, household_id, date_str)

    return MealPlanEntryOut.model_validate(entry)


@router.delete("/{date_str}", status_code=204)
async def delete_meal_plan_entry(
    date_str: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> None:
    date = _parse_date(date_str)

    entries = await _entries_on(session, household_id, date)
    if not entries:
        raise HTTPException(status_code=404, detail="Entry not found")
    for entry in entries:
        await session.delete(entry)
    await session.commit()

    await _publish_change(user, household_id, date_str)


@router.post("/{date_str}/move", response_model=list[MealPlanEntryOut])
async def move_meal_plan_entry(
    date_str: str,
    body: MealPlanMoveRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> list[MealPlanEntryOut]:
    from_date = _parse_date(date_str)
    to_date = _parse_date(body.to)
    if from_date == to_date:
        raise HTTPException(status_code=400, detail="Source and target dates are the same")

    sources = await _entries_on(session, household_id, from_date)
    if not sources:
        raise HTTPException(status_code=404, detail="Entry not found")

    moved = await _move_entries(session, household_id, sources, to_date)
    await session.commit()
    for entry in moved:
        await session.refresh(entry)

    await _publish_change(user, household_id, date_str, body.to)

    return [MealPlanEntryOut.model_validate(entry) for entry in moved]
