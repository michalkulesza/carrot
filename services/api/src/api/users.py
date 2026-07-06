import uuid
from datetime import datetime

from fastapi import Depends, HTTPException, status
from fastapi_users import BaseUserManager, FastAPIUsers, InvalidPasswordException, UUIDIDMixin
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, CookieTransport, JWTStrategy
from fastapi_users.db import SQLAlchemyBaseUserTableUUID, SQLAlchemyUserDatabase
from fastapi_users import schemas
from sqlalchemy import Boolean, String, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from api.config import settings
from api.database import Base, get_async_session


class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"
    nickname: Mapped[str | None] = mapped_column(String(50), nullable=True)
    active_household_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("households.id", ondelete="SET NULL"),
        nullable=True,
    )
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    google_account: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class UserRead(schemas.BaseUser[uuid.UUID]):
    nickname: str | None = None
    active_household_id: uuid.UUID | None = None


class UserCreate(schemas.BaseUserCreate):
    nickname: str | None = None
    google_account: bool = False


class UserUpdate(schemas.BaseUserUpdate):
    nickname: str | None = None


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User)


SHOWCASE_EMAIL = "showcase@demo.com"


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.secret
    verification_token_secret = settings.secret

    async def validate_password(self, password: str, user) -> None:
        if len(password) < 8:
            raise InvalidPasswordException(reason="PASSWORD_TOO_SHORT")

    async def update(self, user_update, user, safe: bool = False, request=None):
        if user.email == SHOWCASE_EMAIL and (user_update.email or user_update.password):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The showcase account's email and password can't be changed.",
            )
        return await super().update(user_update, user, safe=safe, request=request)

    async def delete(self, user, request=None):
        if user.email == SHOWCASE_EMAIL:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The showcase account can't be deleted.",
            )
        return await super().delete(user, request=request)


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


COOKIE_NAME = "pk_auth"
COOKIE_MAX_AGE = 60 * 60 * 24 * 30

cookie_transport = CookieTransport(
    cookie_name=COOKIE_NAME,
    cookie_max_age=COOKIE_MAX_AGE,
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
_current_active_user = fastapi_users_instance.current_user(active=True)


async def current_active_user(
    user: User = Depends(_current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> User:
    """Wraps fastapi-users' dependency to bump the showcase account's
    last_activity_at on every authenticated request, so the idle-reset loop
    only resets it after a real gap in usage, not a fixed clock tick."""
    if user.email == SHOWCASE_EMAIL:
        await session.execute(update(User).where(User.id == user.id).values(last_activity_at=datetime.utcnow()))
        await session.commit()
    return user
