from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.database import async_session_maker, get_async_session
from api.models import PendingSignup
from api.services.email import send_verification_code
from api.services.invitations import claim_email_invitations
from api.users import (
    COOKIE_MAX_AGE,
    COOKIE_NAME,
    User,
    UserCreate,
    UserManager,
    get_jwt_strategy,
    get_user_manager,
)

router = APIRouter()

SIGNUP_TOKEN_PURPOSE = "signup"
SIGNUP_TOKEN_LIFETIME = timedelta(hours=24)


class RequestSignupCodeRequest(BaseModel):
    email: str


class VerifySignupCodeRequest(BaseModel):
    email: str
    code: str


class CompleteSignupRequest(BaseModel):
    token: str
    password: str
    nickname: str | None = None


def _encode_signup_token(email: str) -> str:
    payload = {
        "email": email,
        "purpose": SIGNUP_TOKEN_PURPOSE,
        "exp": datetime.now(timezone.utc) + SIGNUP_TOKEN_LIFETIME,
    }
    return jwt.encode(payload, settings.secret, algorithm="HS256")


def _decode_signup_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=400, detail="SIGNUP_TOKEN_INVALID")
    if payload.get("purpose") != SIGNUP_TOKEN_PURPOSE:
        raise HTTPException(status_code=400, detail="SIGNUP_TOKEN_INVALID")
    return payload["email"]


@router.post("/request-signup-code", status_code=200)
async def request_signup_code(body: RequestSignupCodeRequest) -> dict:
    email = body.email.lower().strip()

    async with async_session_maker() as session:
        existing_user = await session.execute(select(User).where(User.email == email))
        if existing_user.scalar_one_or_none() is not None:
            raise HTTPException(status_code=400, detail="ACCOUNT_EXISTS")

        latest_result = await session.execute(
            select(PendingSignup).where(PendingSignup.email == email)
        )
        latest = latest_result.scalar_one_or_none()

        if latest and latest.created_at + timedelta(seconds=60) > datetime.utcnow():
            return {"detail": "ok"}

        await session.execute(delete(PendingSignup).where(PendingSignup.email == email))

        code = "".join(secrets.choice("0123456789") for _ in range(6))
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        session.add(PendingSignup(
            email=email,
            code_hash=code_hash,
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        ))
        await session.commit()

    await send_verification_code(email, code)
    return {"detail": "ok"}


@router.post("/verify-signup-code", status_code=200)
async def verify_signup_code(body: VerifySignupCodeRequest) -> dict:
    email = body.email.lower().strip()

    async with async_session_maker() as session:
        result = await session.execute(select(PendingSignup).where(PendingSignup.email == email))
        pending = result.scalar_one_or_none()

        if pending is None:
            raise HTTPException(status_code=400, detail="SIGNUP_CODE_INVALID")
        if pending.expires_at <= datetime.utcnow():
            raise HTTPException(status_code=400, detail="SIGNUP_CODE_EXPIRED")
        if pending.attempts >= 5:
            raise HTTPException(status_code=400, detail="SIGNUP_CODE_TOO_MANY_ATTEMPTS")

        provided_hash = hashlib.sha256(body.code.strip().encode()).hexdigest()
        if provided_hash != pending.code_hash:
            pending.attempts += 1
            session.add(pending)
            await session.commit()
            if pending.attempts >= 5:
                raise HTTPException(status_code=400, detail="SIGNUP_CODE_TOO_MANY_ATTEMPTS")
            raise HTTPException(status_code=400, detail="SIGNUP_CODE_INVALID")

    return {"token": _encode_signup_token(email)}


@router.post("/complete-signup", status_code=200)
async def complete_signup(
    body: CompleteSignupRequest,
    session: AsyncSession = Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
) -> JSONResponse:
    email = _decode_signup_token(body.token)

    existing_user = await session.execute(select(User).where(User.email == email))
    if existing_user.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="ACCOUNT_EXISTS")

    user = await user_manager.create(
        UserCreate(email=email, password=body.password, nickname=body.nickname, is_verified=True)
    )

    await session.execute(delete(PendingSignup).where(PendingSignup.email == email))
    await claim_email_invitations(session, user)
    await session.commit()

    access_token = await get_jwt_strategy().write_token(user)
    response = JSONResponse({"access_token": access_token, "token_type": "bearer"})
    response.set_cookie(
        key=COOKIE_NAME,
        value=access_token,
        max_age=COOKIE_MAX_AGE,
        secure=False,
        httponly=True,
        samesite="lax",
    )
    return response
