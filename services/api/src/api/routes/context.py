import uuid

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import HouseholdMember
from api.users import User, current_active_user


async def get_active_household_id(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> uuid.UUID | None:
    """Returns the active household_id (None = Personal). Verifies membership."""
    hid = user.active_household_id
    if hid is None:
        return None
    result = await session.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == hid,
            HouseholdMember.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        # Stale active_household_id — reset silently
        raise HTTPException(status_code=403, detail="Not a member of the active household")
    return hid


def get_scope_key(domain: str, user_id: uuid.UUID, household_id: uuid.UUID | None) -> str:
    """Broadcaster subscription key: shared household scope, or a personal fallback."""
    return f"{domain}:household:{household_id}" if household_id else f"{domain}:user:{user_id}"
