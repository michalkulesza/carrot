from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select, update

from api.database import async_session_maker
from api.models import HouseholdInvitation, InvitationStatus, VerificationCode
from api.services.email import send_verification_code
from api.users import User

router = APIRouter()


class VerifyCodeRequest(BaseModel):
    email: str
    code: str


class RequestVerifyCodeRequest(BaseModel):
    email: str


async def _claim_email_invitations(session, user: User) -> None:
    await session.execute(
        update(HouseholdInvitation)
        .where(HouseholdInvitation.invited_email == user.email.lower())
        .where(HouseholdInvitation.status == InvitationStatus.PENDING)
        .where(HouseholdInvitation.invited_user_id.is_(None))
        .values(invited_user_id=user.id)
    )


@router.post("/verify-code", status_code=200)
async def verify_code(body: VerifyCodeRequest) -> dict:
    async with async_session_maker() as session:
        user_result = await session.execute(
            select(User).where(User.email == body.email.lower().strip())
        )
        user = user_result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=400, detail="Invalid or expired code")

        code_result = await session.execute(
            select(VerificationCode)
            .where(VerificationCode.user_id == user.id)
            .where(VerificationCode.expires_at > datetime.utcnow())
            .order_by(VerificationCode.created_at.desc())
            .limit(1)
        )
        vc = code_result.scalar_one_or_none()

        if vc is None or vc.attempts >= 5:
            raise HTTPException(status_code=400, detail="Invalid or expired code")

        provided_hash = hashlib.sha256(body.code.strip().encode()).hexdigest()
        if provided_hash != vc.code_hash:
            vc.attempts += 1
            if vc.attempts >= 5:
                await session.execute(
                    delete(VerificationCode).where(VerificationCode.id == vc.id)
                )
            else:
                session.add(vc)
            await session.commit()
            raise HTTPException(status_code=400, detail="Invalid or expired code")

        user.is_verified = True
        session.add(user)
        await session.execute(
            delete(VerificationCode).where(VerificationCode.user_id == user.id)
        )
        await _claim_email_invitations(session, user)
        await session.commit()

    return {"detail": "Email verified"}


@router.post("/request-verify-code", status_code=200)
async def request_verify_code(body: RequestVerifyCodeRequest) -> dict:
    async with async_session_maker() as session:
        user_result = await session.execute(
            select(User).where(User.email == body.email.lower().strip())
        )
        user = user_result.scalar_one_or_none()

        if user is None or user.is_verified:
            return {"detail": "ok"}

        latest_result = await session.execute(
            select(VerificationCode)
            .where(VerificationCode.user_id == user.id)
            .order_by(VerificationCode.created_at.desc())
            .limit(1)
        )
        latest = latest_result.scalar_one_or_none()

        if latest and latest.created_at + timedelta(seconds=60) > datetime.utcnow():
            return {"detail": "ok"}

        await session.execute(
            delete(VerificationCode).where(VerificationCode.user_id == user.id)
        )

        code = "".join(secrets.choice("0123456789") for _ in range(6))
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        session.add(VerificationCode(
            user_id=user.id,
            code_hash=code_hash,
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        ))
        await session.commit()

    await send_verification_code(body.email.lower().strip(), code)
    return {"detail": "ok"}
