import secrets
import string
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import (
    Household,
    HouseholdInvitation,
    HouseholdLeaveNotification,
    HouseholdMember,
    InvitationStatus,
    Recipe,
    MealPlanEntry,
    recipe_households_table,
    recipe_related_recipes_table,
    user_recipe_favourites_table,
)
from api.routes.recipes import _link_recipe_to_household
from api.services.embeddings import queue_recipe_embedding
from api.services.orphan_cleanup import delete_orphan_recipes
from api.users import User, current_active_user

router = APIRouter(tags=["households"])

PRESET_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#22c55e", "#ef4444", "#8b5cf6", "#06b6d4"]

_INVITE_CODE_ALPHABET = string.ascii_uppercase + string.digits
_JOIN_RATE_LIMIT = 10
_JOIN_RATE_WINDOW = timedelta(hours=1)


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class HouseholdCreate(BaseModel):
    name: str | None = None
    color: str = "#6366f1"


class HouseholdUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    allergens: list[str] | None = None


class HouseholdOut(BaseModel):
    model_config = {"from_attributes": True}
    id: uuid.UUID
    name: str
    color: str
    created_at: datetime
    allergens: list[str] | None = None
    invite_code: str


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    nickname: str | None
    joined_at: datetime
    role: str


class InvitationOut(BaseModel):
    id: uuid.UUID
    household_id: uuid.UUID
    household_name: str
    invited_by_email: str
    invited_by_nickname: str | None
    created_at: datetime


class InviteRequest(BaseModel):
    email: str


class JoinRequest(BaseModel):
    code: str


class HouseholdLeaveNotificationOut(BaseModel):
    id: uuid.UUID
    household_id: uuid.UUID
    household_name: str
    left_user_email: str
    left_user_nickname: str | None
    created_at: datetime


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


async def _require_admin(
    session: AsyncSession,
    household_id: uuid.UUID,
    user_id: uuid.UUID,
) -> HouseholdMember:
    member = await _require_member(session, household_id, user_id)
    if member.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return member


async def generate_invite_code(session: AsyncSession) -> str:
    while True:
        candidate = "".join(secrets.choice(_INVITE_CODE_ALPHABET) for _ in range(8))
        existing = await session.scalar(select(Household.id).where(Household.invite_code == candidate))
        if existing is None:
            return candidate


async def _wipe_if_empty(session: AsyncSession, household_id: uuid.UUID) -> None:
    count = await session.scalar(
        select(func.count()).select_from(HouseholdMember).where(
            HouseholdMember.household_id == household_id
        )
    )
    if (count or 0) == 0:
        recipe_ids_result = await session.execute(
            select(recipe_households_table.c.recipe_id).where(
                recipe_households_table.c.household_id == household_id
            )
        )
        linked_recipe_ids = [row[0] for row in recipe_ids_result]
        household = await session.get(Household, household_id)
        if household:
            await session.delete(household)
            await session.flush()
        await delete_orphan_recipes(session, linked_recipe_ids)


# ── Join-by-code in-memory rate limiter ─────────────────────────────────────
# Single-worker design, mirrors api/broadcaster.py's in-memory approach — swap
# for a shared store (Redis/Postgres) if this ever runs multi-worker.

_join_attempts: dict[uuid.UUID, list[datetime]] = {}


def _check_join_rate_limit(user_id: uuid.UUID) -> None:
    now = datetime.utcnow()
    attempts = [t for t in _join_attempts.get(user_id, []) if now - t < _JOIN_RATE_WINDOW]
    if len(attempts) >= _JOIN_RATE_LIMIT:
        _join_attempts[user_id] = attempts
        raise HTTPException(status_code=429, detail="Too many join attempts, try again later")
    attempts.append(now)
    _join_attempts[user_id] = attempts


# ── Detach routine (shared by leave and kick) ────────────────────────────────

async def _detach_member(session: AsyncSession, household_id: uuid.UUID, user_id: uuid.UUID) -> None:
    authored_result = await session.execute(
        select(Recipe)
        .join(recipe_households_table, recipe_households_table.c.recipe_id == Recipe.id)
        .where(Recipe.author_id == user_id, recipe_households_table.c.household_id == household_id)
    )
    authored_recipes = list(authored_result.scalars().unique().all())

    remaining_members_result = await session.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id != user_id,
        )
    )
    remaining_members = list(remaining_members_result.scalars().all())
    remaining_member_ids = [m.user_id for m in remaining_members]

    for recipe in authored_recipes:
        await session.refresh(recipe, attribute_names=["tags"])
        copy = Recipe(
            author_id=None,
            title=recipe.title,
            servings=recipe.servings,
            total_time_minutes=recipe.total_time_minutes,
            kcal_per_serving=recipe.kcal_per_serving,
            protein_per_serving=recipe.protein_per_serving,
            fat_per_serving=recipe.fat_per_serving,
            carbs_per_serving=recipe.carbs_per_serving,
            thumbnail_url=recipe.thumbnail_url,
            creator_handle=recipe.creator_handle,
            source_url=recipe.source_url,
            components=recipe.components,
            notes=recipe.notes,
            position=recipe.position,
            created_at=recipe.created_at,
            updated_at=datetime.utcnow(),
        )
        copy.tags = list(recipe.tags)
        session.add(copy)
        await session.flush()

        related_result = await session.execute(
            select(recipe_related_recipes_table.c.recipe_id, recipe_related_recipes_table.c.related_recipe_id).where(
                (recipe_related_recipes_table.c.recipe_id == recipe.id)
                | (recipe_related_recipes_table.c.related_recipe_id == recipe.id)
            )
        )
        for r1, r2 in related_result.all():
            other_id = r2 if r1 == recipe.id else r1
            other_linked = await session.scalar(
                select(recipe_households_table.c.recipe_id).where(
                    recipe_households_table.c.recipe_id == other_id,
                    recipe_households_table.c.household_id == household_id,
                )
            )
            if other_linked is None:
                continue
            new_recipe_id, new_related_id = min(copy.id, other_id), max(copy.id, other_id)
            await session.execute(
                pg_insert(recipe_related_recipes_table)
                .values(recipe_id=new_recipe_id, related_recipe_id=new_related_id)
                .on_conflict_do_nothing(index_elements=["recipe_id", "related_recipe_id"])
            )

        await _link_recipe_to_household(session, copy.id, household_id)
        await session.execute(
            delete(recipe_households_table).where(
                recipe_households_table.c.recipe_id == recipe.id,
                recipe_households_table.c.household_id == household_id,
            )
        )

        await session.execute(
            update(MealPlanEntry)
            .where(MealPlanEntry.household_id == household_id, MealPlanEntry.recipe_id == recipe.id)
            .values(recipe_id=copy.id)
        )

        if remaining_member_ids:
            favourited_result = await session.execute(
                select(user_recipe_favourites_table.c.user_id).where(
                    user_recipe_favourites_table.c.recipe_id == recipe.id,
                    user_recipe_favourites_table.c.user_id.in_(remaining_member_ids),
                )
            )
            favourited_by = [row[0] for row in favourited_result]
            if favourited_by:
                await session.execute(
                    delete(user_recipe_favourites_table).where(
                        user_recipe_favourites_table.c.recipe_id == recipe.id,
                        user_recipe_favourites_table.c.user_id.in_(favourited_by),
                    )
                )
                await session.execute(
                    user_recipe_favourites_table.insert().values(
                        [{"user_id": uid, "recipe_id": copy.id} for uid in favourited_by]
                    )
                )

        await queue_recipe_embedding(session, copy)

    for recipient in remaining_members:
        session.add(HouseholdLeaveNotification(
            household_id=household_id,
            recipient_user_id=recipient.user_id,
            left_user_id=user_id,
        ))

    leaving_member = await session.get(HouseholdMember, {"household_id": household_id, "user_id": user_id})
    was_only_admin = leaving_member is not None and leaving_member.role == "admin" and not any(
        m.role == "admin" for m in remaining_members
    )
    if leaving_member is not None:
        await session.delete(leaving_member)
        await session.flush()

    if was_only_admin and remaining_members:
        successor = min(remaining_members, key=lambda m: m.joined_at)
        successor.role = "admin"

    if not remaining_members:
        await _wipe_if_empty(session, household_id)
    else:
        touched_recipe_ids = [r.id for r in authored_recipes]
        if touched_recipe_ids:
            await delete_orphan_recipes(session, touched_recipe_ids)

    user = await session.get(User, user_id)
    if user is not None and user.active_household_id == household_id:
        next_household = await session.scalar(
            select(HouseholdMember).where(HouseholdMember.user_id == user_id).order_by(HouseholdMember.joined_at)
        )
        user.active_household_id = next_household.household_id if next_household is not None else None
        session.add(user)


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
    invite_code = await generate_invite_code(session)

    household = Household(name=name, color=color, invite_code=invite_code)
    session.add(household)
    await session.flush()

    session.add(HouseholdMember(household_id=household.id, user_id=user.id, role="admin"))

    user.active_household_id = household.id
    session.add(user)

    await session.commit()
    await session.refresh(household)
    return HouseholdOut.model_validate(household)


@router.post("/households/join")
async def join_household(
    body: JoinRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> dict:
    _check_join_rate_limit(user.id)

    normalized_code = body.code.strip().upper().replace("-", "")
    household = await session.scalar(select(Household).where(Household.invite_code == normalized_code))
    if household is None:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    existing = await session.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household.id,
            HouseholdMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Already a member of this household")

    session.add(HouseholdMember(household_id=household.id, user_id=user.id, role="member"))
    user.active_household_id = household.id
    session.add(user)
    await session.commit()
    return {"active_household_id": str(household.id)}


@router.post("/households/{household_id}/rotate-code", response_model=HouseholdOut)
async def rotate_invite_code(
    household_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> HouseholdOut:
    await _require_admin(session, household_id, user.id)
    household = await session.get(Household, household_id)
    if household is None:
        raise HTTPException(status_code=404, detail="Household not found")
    household.invite_code = await generate_invite_code(session)
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
            role=m.role,
        )
        for m, u in result.all()
    ]


@router.delete("/households/{household_id}/members/{user_id}", status_code=204)
async def remove_member(
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    await _require_admin(session, household_id, user.id)
    target = await session.get(HouseholdMember, {"household_id": household_id, "user_id": user_id})
    if target is None:
        raise HTTPException(status_code=404, detail="Not a member")
    await _detach_member(session, household_id, user_id)
    await session.commit()


@router.post("/households/{household_id}/members/{user_id}/promote", response_model=MemberOut)
async def promote_member(
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> MemberOut:
    await _require_admin(session, household_id, user.id)
    target_result = await session.execute(
        select(HouseholdMember, User)
        .join(User, User.id == HouseholdMember.user_id)
        .where(HouseholdMember.household_id == household_id, HouseholdMember.user_id == user_id)
    )
    row = target_result.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Not a member")
    member, target_user = row
    member.role = "admin"
    await session.commit()
    return MemberOut(
        user_id=member.user_id,
        email=target_user.email,
        nickname=target_user.nickname,
        joined_at=member.joined_at,
        role=member.role,
    )


@router.post("/households/{household_id}/leave", status_code=204)
async def leave_household(
    household_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    member = await session.get(HouseholdMember, {"household_id": household_id, "user_id": user.id})
    if member is None:
        raise HTTPException(status_code=404, detail="Not a member")
    await _detach_member(session, household_id, user.id)
    await session.commit()


@router.get("/household-leave-notifications", response_model=list[HouseholdLeaveNotificationOut])
async def list_household_leave_notifications(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[HouseholdLeaveNotificationOut]:
    result = await session.execute(
        select(HouseholdLeaveNotification, Household, User)
        .join(Household, Household.id == HouseholdLeaveNotification.household_id)
        .join(User, User.id == HouseholdLeaveNotification.left_user_id)
        .where(HouseholdLeaveNotification.recipient_user_id == user.id)
        .order_by(HouseholdLeaveNotification.created_at.desc())
    )
    return [
        HouseholdLeaveNotificationOut(
            id=n.id,
            household_id=n.household_id,
            household_name=h.name,
            left_user_email=u.email,
            left_user_nickname=u.nickname,
            created_at=n.created_at,
        )
        for n, h, u in result.all()
    ]


@router.post("/household-leave-notifications/{notification_id}/dismiss", status_code=204)
async def dismiss_household_leave_notification(
    notification_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    notif = await session.get(HouseholdLeaveNotification, notification_id)
    if notif is None or notif.recipient_user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    await session.delete(notif)
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
    session.add(HouseholdMember(household_id=inv.household_id, user_id=user.id, role="member"))
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
