import calendar as cal
from datetime import date as DateType

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import MealPlanEntry, MealPlanEntryOut, MealPlanSetRequest, Recipe
from api.users import User, current_active_user

router = APIRouter(prefix="/meal-plan", tags=["meal-plan"])


@router.get("", response_model=list[MealPlanEntryOut])
async def list_meal_plan(
    month: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[MealPlanEntryOut]:
    try:
        year, m = int(month.split("-")[0]), int(month.split("-")[1])
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid month format, use YYYY-MM")

    last_day = cal.monthrange(year, m)[1]
    start = DateType(year, m, 1)
    end = DateType(year, m, last_day)

    result = await session.execute(
        select(MealPlanEntry).where(
            MealPlanEntry.user_id == user.id,
            MealPlanEntry.date >= start,
            MealPlanEntry.date <= end,
        )
    )
    return [MealPlanEntryOut.model_validate(e) for e in result.scalars().all()]


@router.put("/{date_str}", response_model=MealPlanEntryOut)
async def set_meal_plan_entry(
    date_str: str,
    body: MealPlanSetRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> MealPlanEntryOut:
    try:
        date = DateType.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    recipe_result = await session.execute(
        select(Recipe).where(Recipe.id == body.recipe_id, Recipe.user_id == user.id)
    )
    if recipe_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    result = await session.execute(
        select(MealPlanEntry).where(
            MealPlanEntry.user_id == user.id,
            MealPlanEntry.date == date,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        entry = MealPlanEntry(user_id=user.id, date=date, recipe_id=body.recipe_id)
        session.add(entry)
    else:
        entry.recipe_id = body.recipe_id

    await session.commit()
    await session.refresh(entry)
    return MealPlanEntryOut.model_validate(entry)


@router.delete("/{date_str}", status_code=204)
async def delete_meal_plan_entry(
    date_str: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    try:
        date = DateType.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    result = await session.execute(
        select(MealPlanEntry).where(
            MealPlanEntry.user_id == user.id,
            MealPlanEntry.date == date,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    await session.delete(entry)
    await session.commit()
