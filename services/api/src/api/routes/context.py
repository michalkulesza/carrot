import uuid

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import HouseholdMember
from api.users import User, current_active_user

NO_ACTIVE_HOUSEHOLD = "NO_ACTIVE_HOUSEHOLD"


async def get_active_household_id(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> uuid.UUID:
    """Returns the active household_id. Raises 409 NO_ACTIVE_HOUSEHOLD if the user has none."""
    hid = user.active_household_id
    if hid is not None:
        membership = await session.execute(
            select(HouseholdMember).where(
                HouseholdMember.household_id == hid,
                HouseholdMember.user_id == user.id,
            )
        )
        if membership.scalar_one_or_none() is not None:
            return hid

    other_membership = await session.scalar(
        select(HouseholdMember).where(HouseholdMember.user_id == user.id)
    )
    user.active_household_id = other_membership.household_id if other_membership is not None else None
    await session.commit()
    if user.active_household_id is None:
        raise HTTPException(status_code=409, detail=NO_ACTIVE_HOUSEHOLD)
    return user.active_household_id


def get_scope_key(domain: str, user_id: uuid.UUID, household_id: uuid.UUID) -> str:
    return f"{domain}:household:{household_id}"
