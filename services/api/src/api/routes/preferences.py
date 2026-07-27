from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import RecipeServingPreferenceUpdate, UserPreferences, UserPreferencesOut, UserPreferencesUpdate
from api.users import User, current_active_user

router = APIRouter(prefix="/preferences", tags=["preferences"])


def _new_preferences(user_id: object) -> UserPreferences:
    return UserPreferences(user_id=user_id)


@router.get("", response_model=UserPreferencesOut)
async def get_preferences(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> UserPreferencesOut:
    result = await session.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()
    if prefs is None:
        return UserPreferencesOut(
            week_start_day=1,
            auto_substitute=False,
            personal_allergens=None,
            language="en",
        )
    return UserPreferencesOut.model_validate(prefs)


@router.put("", response_model=UserPreferencesOut)
async def update_preferences(
    body: UserPreferencesUpdate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> UserPreferencesOut:
    result = await session.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()
    if prefs is None:
        prefs = _new_preferences(user.id)
        if body.week_start_day is not None:
            prefs.week_start_day = body.week_start_day
        if body.auto_substitute is not None:
            prefs.auto_substitute = body.auto_substitute
        if body.personal_allergens is not None:
            prefs.personal_allergens = body.personal_allergens
        if body.language is not None:
            prefs.language = body.language
        if body.unit_system is not None:
            prefs.unit_system = body.unit_system
        session.add(prefs)
    else:
        if body.week_start_day is not None:
            prefs.week_start_day = body.week_start_day
        if body.auto_substitute is not None:
            prefs.auto_substitute = body.auto_substitute
        if body.personal_allergens is not None:
            prefs.personal_allergens = body.personal_allergens
        if body.language is not None:
            prefs.language = body.language
        if body.unit_system is not None:
            prefs.unit_system = body.unit_system

    await session.commit()
    await session.refresh(prefs)
    return UserPreferencesOut.model_validate(prefs)


@router.put("/recipe-servings/{recipe_id}", response_model=UserPreferencesOut)
async def update_recipe_serving_preference(
    recipe_id: str,
    body: RecipeServingPreferenceUpdate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> UserPreferencesOut:
    result = await session.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()
    if prefs is None:
        prefs = _new_preferences(user.id)
        session.add(prefs)

    prefs.recipe_serving_overrides = {
        **prefs.recipe_serving_overrides,
        recipe_id: body.servings,
    }
    await session.commit()
    await session.refresh(prefs)
    return UserPreferencesOut.model_validate(prefs)
