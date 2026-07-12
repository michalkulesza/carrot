from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import UserPreferences, UserPreferencesOut, UserPreferencesUpdate
from api.users import User, current_active_user

router = APIRouter(prefix="/preferences", tags=["preferences"])


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
            share_imports_to_personal=False,
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
        prefs = UserPreferences(
            user_id=user.id,
            week_start_day=body.week_start_day if body.week_start_day is not None else 1,
            auto_substitute=body.auto_substitute if body.auto_substitute is not None else False,
            personal_allergens=body.personal_allergens,
            language=body.language if body.language is not None else "en",
            share_imports_to_personal=body.share_imports_to_personal if body.share_imports_to_personal is not None else False,
        )
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
        if body.share_imports_to_personal is not None:
            prefs.share_imports_to_personal = body.share_imports_to_personal

    await session.commit()
    await session.refresh(prefs)
    return UserPreferencesOut.model_validate(prefs)
