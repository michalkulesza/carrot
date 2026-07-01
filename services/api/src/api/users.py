import hashlib
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, CookieTransport, JWTStrategy
from fastapi_users.db import SQLAlchemyBaseUserTableUUID, SQLAlchemyUserDatabase
from fastapi_users import schemas
from sqlalchemy import String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from api.config import settings
from api.database import Base, async_session_maker, get_async_session


class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"
    nickname: Mapped[str | None] = mapped_column(String(50), nullable=True)
    active_household_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("households.id", ondelete="SET NULL"),
        nullable=True,
    )


class UserRead(schemas.BaseUser[uuid.UUID]):
    nickname: str | None = None
    active_household_id: uuid.UUID | None = None


class UserCreate(schemas.BaseUserCreate):
    nickname: str | None = None


class UserUpdate(schemas.BaseUserUpdate):
    nickname: str | None = None


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.secret
    verification_token_secret = settings.secret

    async def on_after_register(self, user: User, request: Request | None = None) -> None:
        from api.models import VerificationCode
        from api.services.email import send_verification_code

        code = "".join(secrets.choice("0123456789") for _ in range(6))
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        expires_at = datetime.utcnow() + timedelta(minutes=15)

        async with async_session_maker() as session:
            session.add(VerificationCode(user_id=user.id, code_hash=code_hash, expires_at=expires_at))
            await session.commit()

        await send_verification_code(user.email, code)


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


cookie_transport = CookieTransport(
    cookie_name="pk_auth",
    cookie_max_age=60 * 60 * 24 * 30,
    cookie_secure=False,
    cookie_httponly=True,
    cookie_samesite="lax",
)


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=settings.secret, lifetime_seconds=60 * 60 * 24 * 30)


auth_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)

bearer_transport = BearerTransport(tokenUrl="/api/auth/jwt/login")

jwt_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users_instance = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend, jwt_backend])
current_active_user = fastapi_users_instance.current_user(active=True)
