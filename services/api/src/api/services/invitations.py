from __future__ import annotations

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import HouseholdInvitation, InvitationStatus
from api.users import User


async def claim_email_invitations(session: AsyncSession, user: User) -> None:
    await session.execute(
        update(HouseholdInvitation)
        .where(HouseholdInvitation.invited_email == user.email.lower())
        .where(HouseholdInvitation.status == InvitationStatus.PENDING)
        .where(HouseholdInvitation.invited_user_id.is_(None))
        .values(invited_user_id=user.id)
    )
