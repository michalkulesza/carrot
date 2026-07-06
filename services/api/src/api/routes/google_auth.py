from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.database import get_async_session
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

_VALID_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


class GoogleLoginRequest(BaseModel):
    id_token: str


@router.post("/google", status_code=200)
async def google_login(
    body: GoogleLoginRequest,
    session: AsyncSession = Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
) -> JSONResponse:
    try:
        idinfo = google_id_token.verify_oauth2_token(body.id_token, google_requests.Request())
    except ValueError:
        raise HTTPException(status_code=400, detail="GOOGLE_TOKEN_INVALID")

    valid_client_ids = {
        settings.google_ios_client_id,
        settings.google_android_client_id,
        settings.google_web_client_id,
    }
    if idinfo.get("aud") not in valid_client_ids:
        raise HTTPException(status_code=400, detail="GOOGLE_TOKEN_INVALID")
    if idinfo.get("iss") not in _VALID_ISSUERS:
        raise HTTPException(status_code=400, detail="GOOGLE_TOKEN_INVALID")
    if not idinfo.get("email_verified"):
        raise HTTPException(status_code=400, detail="GOOGLE_TOKEN_INVALID")

    email = idinfo["email"].lower()

    existing_user = await session.execute(select(User).where(User.email == email))
    user = existing_user.scalar_one_or_none()

    if user is None:
        user = await user_manager.create(
            UserCreate(
                email=email,
                password=secrets.token_urlsafe(32),
                nickname=idinfo.get("name"),
                is_verified=True,
                google_account=True,
            )
        )
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
