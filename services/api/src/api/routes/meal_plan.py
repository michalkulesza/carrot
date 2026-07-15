import asyncio
import calendar as cal
import json
import re
import uuid
from datetime import date as DateType

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.broadcaster import broadcaster
from api.database import get_async_session
from api.models import MealPlanEntry, MealPlanEntryOut, MealPlanSetRequest, Recipe, recipe_personal_links_table
from api.routes.context import get_active_household_id, get_scope_key
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


def _entry_filter(user_id: uuid.UUID, household_id: uuid.UUID | None, date: DateType):
    if household_id is not None:
        return and_(MealPlanEntry.household_id == household_id, MealPlanEntry.date == date)
    return and_(
        MealPlanEntry.user_id == user_id,
        MealPlanEntry.household_id.is_(None),
        MealPlanEntry.date == date,
    )


def _recipe_access_filter(user_id: uuid.UUID, household_id: uuid.UUID | None, recipe_id: uuid.UUID):
    if household_id is not None:
        return and_(Recipe.id == recipe_id, Recipe.household_id == household_id)
    personally_linked = exists(
        select(recipe_personal_links_table.c.recipe_id).where(
            recipe_personal_links_table.c.user_id == user_id,
            recipe_personal_links_table.c.recipe_id == recipe_id,
        )
    )
    return and_(
        Recipe.id == recipe_id,
        or_(
            and_(
                Recipe.user_id == user_id,
                or_(Recipe.household_id.is_(None), Recipe.shared_to_personal.is_(True)),
            ),
            personally_linked,
        ),
    )


def _next_entry_statement(
    user_id: uuid.UUID,
    household_id: uuid.UUID | None,
    from_date: DateType,
):
    if household_id is not None:
        where = and_(
            MealPlanEntry.household_id == household_id,
            MealPlanEntry.date >= from_date,
        )
    else:
        where = and_(
            MealPlanEntry.user_id == user_id,
            MealPlanEntry.household_id.is_(None),
            MealPlanEntry.date >= from_date,
        )

    return select(MealPlanEntry).where(where).order_by(MealPlanEntry.date.asc()).limit(1)


@router.get("", response_model=list[MealPlanEntryOut])
async def list_meal_plan(
    month: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> list[MealPlanEntryOut]:
    try:
        year, m = int(month.split("-")[0]), int(month.split("-")[1])
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid month format, use YYYY-MM")

    last_day = cal.monthrange(year, m)[1]
    start = DateType(year, m, 1)
    end = DateType(year, m, last_day)

    if household_id is not None:
        where = and_(
            MealPlanEntry.household_id == household_id,
            MealPlanEntry.date >= start,
            MealPlanEntry.date <= end,
        )
    else:
        where = and_(
            MealPlanEntry.user_id == user.id,
            MealPlanEntry.household_id.is_(None),
            MealPlanEntry.date >= start,
            MealPlanEntry.date <= end,
        )

    result = await session.execute(select(MealPlanEntry).where(where))
    return [MealPlanEntryOut.model_validate(e) for e in result.scalars().all()]


@router.get("/next", response_model=MealPlanEntryOut | None)
async def get_next_meal_plan_entry(
    from_: str = Query(alias="from"),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> MealPlanEntryOut | None:
    from_date = _parse_date(from_)
    statement = _next_entry_statement(user.id, household_id, from_date)
    result = await session.execute(statement)
    entry = result.scalar_one_or_none()

    return MealPlanEntryOut.model_validate(entry) if entry is not None else None


# NOTE: /stream must be defined before /{date_str}
@router.get("/stream")
async def stream_meal_plan(
    request: Request,
    user: User = Depends(current_active_user),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> StreamingResponse:
    scope = get_scope_key("meal-plan", user.id, household_id)

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


@router.put("/{date_str}", response_model=MealPlanEntryOut)
async def set_meal_plan_entry(
    date_str: str,
    body: MealPlanSetRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> MealPlanEntryOut:
    date = _parse_date(date_str)
    recipe = None
    if body.recipe_id is not None:
        recipe_result = await session.execute(
            select(Recipe).where(_recipe_access_filter(user.id, household_id, body.recipe_id))
        )
        recipe = recipe_result.scalar_one_or_none()
        if recipe is None:
            raise HTTPException(status_code=404, detail="Recipe not found")

    result = await session.execute(
        select(MealPlanEntry).where(_entry_filter(user.id, household_id, date))
    )
    entry = result.scalar_one_or_none()
    if entry is None:
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
        entry.recipe_id = body.recipe_id
        entry.recipe = recipe
        entry.text = body.text

    await session.commit()
    await session.refresh(entry)

    scope = get_scope_key("meal-plan", user.id, household_id)
    await broadcaster.publish(scope, {"type": "meal_plan_changed", "date": date_str})

    return MealPlanEntryOut.model_validate(entry)


@router.delete("/{date_str}", status_code=204)
async def delete_meal_plan_entry(
    date_str: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> None:
    date = _parse_date(date_str)

    result = await session.execute(
        select(MealPlanEntry).where(_entry_filter(user.id, household_id, date))
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    await session.delete(entry)
    await session.commit()

    scope = get_scope_key("meal-plan", user.id, household_id)
    await broadcaster.publish(scope, {"type": "meal_plan_changed", "date": date_str})
