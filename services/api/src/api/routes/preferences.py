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
        return UserPreferencesOut(week_start_day=1)
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
        prefs = UserPreferences(user_id=user.id, week_start_day=body.week_start_day)
        session.add(prefs)
    else:
        prefs.week_start_day = body.week_start_day

    await session.commit()
    await session.refresh(prefs)
    return UserPreferencesOut.model_validate(prefs)
