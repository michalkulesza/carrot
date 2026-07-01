import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import (
    Household,
    HouseholdInvitation,
    HouseholdMember,
    InvitationStatus,
    Recipe,
)
from api.users import User, current_active_user

router = APIRouter(tags=["households"])

PRESET_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#22c55e", "#ef4444", "#8b5cf6", "#06b6d4"]


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class HouseholdCreate(BaseModel):
    name: str | None = None
    color: str = "#6366f1"


class HouseholdUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    allergens: dict | None = None


class HouseholdOut(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    name: str
    color: str
    created_at: datetime
    allergens: dict | None = None


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    nickname: str | None
    joined_at: datetime


class InvitationOut(BaseModel):
    id: uuid.UUID
    household_id: uuid.UUID
    household_name: str
    invited_by_email: str
    invited_by_nickname: str | None
    created_at: datetime


class InviteRequest(BaseModel):
    email: str


class SwitchHouseholdRequest(BaseModel):
    household_id: uuid.UUID | None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _require_member(
    session: AsyncSession,
    household_id: uuid.UUID,
    user_id: uuid.UUID,
) -> HouseholdMember:
    result = await session.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=403, detail="Not a member of this household")
    return member


async def _wipe_if_empty(session: AsyncSession, household_id: uuid.UUID) -> None:
    count = await session.scalar(
        select(func.count()).select_from(HouseholdMember).where(
            HouseholdMember.household_id == household_id
        )
    )
    if (count or 0) == 0:
        household = await session.get(Household, household_id)
        if household:
            await session.delete(household)


# ── Context switch ────────────────────────────────────────────────────────────

@router.patch("/me/active-household")
async def switch_active_household(
    body: SwitchHouseholdRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    if body.household_id is not None:
        await _require_member(session, body.household_id, user.id)
    user.active_household_id = body.household_id
    session.add(user)
    await session.commit()
    return {"active_household_id": str(body.household_id) if body.household_id else None}


# ── Households CRUD ───────────────────────────────────────────────────────────

@router.post("/households", response_model=HouseholdOut, status_code=201)
async def create_household(
    body: HouseholdCreate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> HouseholdOut:
    name = (body.name or "").strip() or f"{user.nickname or user.email}'s household"
    color = body.color if body.color in PRESET_COLORS else PRESET_COLORS[0]

    household = Household(name=name, color=color)
    session.add(household)
    await session.flush()

    session.add(HouseholdMember(household_id=household.id, user_id=user.id))

    user.active_household_id = household.id
    session.add(user)

    await session.commit()
    await session.refresh(household)
    return HouseholdOut.model_validate(household)


@router.get("/households", response_model=list[HouseholdOut])
async def list_my_households(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[HouseholdOut]:
    result = await session.execute(
        select(Household)
        .join(HouseholdMember, HouseholdMember.household_id == Household.id)
        .where(HouseholdMember.user_id == user.id)
        .order_by(Household.created_at)
    )
    return [HouseholdOut.model_validate(h) for h in result.scalars().all()]


@router.get("/households/{household_id}", response_model=HouseholdOut)
async def get_household(
    household_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> HouseholdOut:
    await _require_member(session, household_id, user.id)
    household = await session.get(Household, household_id)
    if not household:
        raise HTTPException(status_code=404, detail="Household not found")
    return HouseholdOut.model_validate(household)


@router.patch("/households/{household_id}", response_model=HouseholdOut)
async def update_household(
    household_id: uuid.UUID,
    body: HouseholdUpdate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> HouseholdOut:
    await _require_member(session, household_id, user.id)
    household = await session.get(Household, household_id)
    if not household:
        raise HTTPException(status_code=404, detail="Household not found")

    if body.name is not None:
        stripped = body.name.strip()
        if stripped:
            household.name = stripped
    if body.color is not None and body.color in PRESET_COLORS:
        household.color = body.color
    if body.allergens is not None:
        household.allergens = body.allergens

    await session.commit()
    await session.refresh(household)
    return HouseholdOut.model_validate(household)


@router.get("/households/{household_id}/members", response_model=list[MemberOut])
async def list_members(
    household_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[MemberOut]:
    await _require_member(session, household_id, user.id)
    result = await session.execute(
        select(HouseholdMember, User)
        .join(User, User.id == HouseholdMember.user_id)
        .where(HouseholdMember.household_id == household_id)
        .order_by(HouseholdMember.joined_at)
    )
    return [
        MemberOut(
            user_id=m.user_id,
            email=u.email,
            nickname=u.nickname,
            joined_at=m.joined_at,
        )
        for m, u in result.all()
    ]


@router.post("/households/{household_id}/leave", status_code=204)
async def leave_household(
    household_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    member = await session.get(HouseholdMember, {"household_id": household_id, "user_id": user.id})
    if member is None:
        raise HTTPException(status_code=404, detail="Not a member")

    # Snapshot shared_to_personal recipes into Personal
    recipes_result = await session.execute(
        select(Recipe).where(
            Recipe.household_id == household_id,
            Recipe.user_id == user.id,
            Recipe.shared_to_personal.is_(True),
        )
    )
    for recipe in recipes_result.scalars().all():
        session.add(Recipe(
            user_id=user.id,
            household_id=None,
            shared_to_personal=True,
            title=recipe.title,
            servings=recipe.servings,
            kcal_per_serving=recipe.kcal_per_serving,
            thumbnail_url=recipe.thumbnail_url,
            creator_handle=recipe.creator_handle,
            source_url=recipe.source_url,
            components=recipe.components,
        ))

    await session.delete(member)

    if user.active_household_id == household_id:
        user.active_household_id = None
        session.add(user)

    await session.flush()
    await _wipe_if_empty(session, household_id)
    await session.commit()


# ── Invitations ───────────────────────────────────────────────────────────────

@router.post("/households/{household_id}/invitations", status_code=201)
async def invite_user(
    household_id: uuid.UUID,
    body: InviteRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    from api.services.email import send_household_invitation

    await _require_member(session, household_id, user.id)

    household_result = await session.execute(
        select(Household).where(Household.id == household_id)
    )
    household = household_result.scalar_one_or_none()
    if household is None:
        raise HTTPException(status_code=404, detail="Household not found")

    email = body.email.lower().strip()
    inviter_name = user.nickname or user.email

    target_result = await session.execute(
        select(User).where(User.email == email)
    )
    target = target_result.scalar_one_or_none()

    if target is not None:
        if target.id == user.id:
            raise HTTPException(status_code=400, detail="Cannot invite yourself")

        already_member = await session.execute(
            select(HouseholdMember).where(
                HouseholdMember.household_id == household_id,
                HouseholdMember.user_id == target.id,
            )
        )
        if already_member.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="User is already a member")

        pending = await session.execute(
            select(HouseholdInvitation).where(
                HouseholdInvitation.household_id == household_id,
                HouseholdInvitation.invited_user_id == target.id,
                HouseholdInvitation.status == InvitationStatus.PENDING,
            )
        )
        if pending.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="Invitation already pending")

        session.add(HouseholdInvitation(
            household_id=household_id,
            invited_user_id=target.id,
            invited_email=email,
            invited_by_user_id=user.id,
            status=InvitationStatus.PENDING,
        ))
    else:
        pending_email = await session.execute(
            select(HouseholdInvitation).where(
                HouseholdInvitation.household_id == household_id,
                HouseholdInvitation.invited_email == email,
                HouseholdInvitation.invited_user_id.is_(None),
                HouseholdInvitation.status == InvitationStatus.PENDING,
            )
        )
        if pending_email.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="Invitation already pending")

        session.add(HouseholdInvitation(
            household_id=household_id,
            invited_user_id=None,
            invited_email=email,
            invited_by_user_id=user.id,
            status=InvitationStatus.PENDING,
        ))

    await session.commit()
    await send_household_invitation(email, household.name, inviter_name)
    return {"detail": "Invitation sent"}


@router.get("/invitations", response_model=list[InvitationOut])
async def list_my_invitations(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[InvitationOut]:
    result = await session.execute(
        select(HouseholdInvitation, Household, User)
        .join(Household, Household.id == HouseholdInvitation.household_id)
        .join(User, User.id == HouseholdInvitation.invited_by_user_id)
        .where(
            HouseholdInvitation.invited_user_id == user.id,
            HouseholdInvitation.status == InvitationStatus.PENDING,
        )
        .order_by(HouseholdInvitation.created_at.desc())
    )
    return [
        InvitationOut(
            id=inv.id,
            household_id=inv.household_id,
            household_name=h.name,
            invited_by_email=inviter.email,
            invited_by_nickname=inviter.nickname,
            created_at=inv.created_at,
        )
        for inv, h, inviter in result.all()
    ]


@router.post("/invitations/{invitation_id}/accept", status_code=200)
async def accept_invitation(
    invitation_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    inv = await session.get(HouseholdInvitation, invitation_id)
    if not inv or inv.invited_user_id != user.id or inv.status != InvitationStatus.PENDING:
        raise HTTPException(status_code=404, detail="Invitation not found")

    inv.status = InvitationStatus.ACCEPTED
    session.add(HouseholdMember(household_id=inv.household_id, user_id=user.id))
    user.active_household_id = inv.household_id
    session.add(user)

    await session.commit()
    return {"active_household_id": str(inv.household_id)}


@router.post("/invitations/{invitation_id}/decline", status_code=204)
async def decline_invitation(
    invitation_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    inv = await session.get(HouseholdInvitation, invitation_id)
    if not inv or inv.invited_user_id != user.id or inv.status != InvitationStatus.PENDING:
        raise HTTPException(status_code=404, detail="Invitation not found")

    inv.status = InvitationStatus.DECLINED
    await session.commit()
