import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_users.exceptions import UserAlreadyExists

from api.config import settings
from api.database import Base, async_session_maker, engine
from api.routes.imports import router as imports_router
from api.routes.proxy import router as proxy_router
from api.routes.recipes import router as recipes_router
from api.users import (
    UserCreate,
    UserManager,
    UserRead,
    UserUpdate,
    auth_backend,
    fastapi_users_instance,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from api.users import User

logging.basicConfig(level=logging.DEBUG)


async def _seed_demo_user() -> None:
    async with async_session_maker() as session:
        user_db = SQLAlchemyUserDatabase(session, User)
        manager = UserManager(user_db)
        try:
            await manager.create(
                UserCreate(
                    email="demo@demo.com",
                    password="demo",
                    nickname="justahacker",
                    is_verified=True,
                )
            )
        except UserAlreadyExists:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _seed_demo_user()
    yield


app = FastAPI(title="PlateKeeper API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(imports_router, prefix="/api")
app.include_router(proxy_router, prefix="/api")
app.include_router(recipes_router, prefix="/api")

app.include_router(
    fastapi_users_instance.get_auth_router(auth_backend),
    prefix="/api/auth/cookie",
    tags=["auth"],
)
app.include_router(
    fastapi_users_instance.get_register_router(UserRead, UserCreate),
    prefix="/api/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users_instance.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["users"],
)


@app.get("/healthz")
async def health() -> dict[str, str]:
    return {"status": "ok"}
