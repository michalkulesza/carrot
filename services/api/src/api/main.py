import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from fastapi_users.exceptions import UserAlreadyExists
from sqlalchemy import select

from api.config import settings
from api.database import Base, async_session_maker, engine
from api.models import Tag
from api.routes.auth import router as auth_verify_router
from api.routes.allergens import router as allergens_router
from api.routes.export import router as export_router
from api.routes.households import router as households_router
from api.routes.images import router as images_router
from api.routes.imports import router as imports_router
from api.routes.meal_plan import router as meal_plan_router
from api.routes.preferences import router as preferences_router
from api.routes.proxy import router as proxy_router
from api.routes.recipes import router as recipes_router
from api.routes.shopping_list import router as shopping_list_router
from api.routes.signup import router as signup_router
from api.routes.tags import router as tags_router
from api.services import import_worker
from api.users import (
    UserCreate,
    UserManager,
    UserRead,
    UserUpdate,
    auth_backend,
    fastapi_users_instance,
    jwt_backend,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from api.users import User

logging.basicConfig(level=logging.DEBUG)

_DEFAULT_TAGS = [
    # Diet
    "Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free", "Keto", "Low-Carb",
    # Meal type
    "Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Drink",
    # Method
    "Quick", "Grilled", "Baked", "One-Pot",
    # Other
    "High-Protein", "Comfort Food",
    # Cuisine
    "Italian", "Asian",
]


async def _seed_demo_user() -> None:
    async with async_session_maker() as session:
        user_db = SQLAlchemyUserDatabase(session, User)
        manager = UserManager(user_db)
        for user_data in [
            UserCreate(email="demo@demo.com", password="demo", nickname="justahacker", is_verified=True),
            UserCreate(email="alt@demo.com", password="demo", nickname="Demo Alt", is_verified=True),
        ]:
            try:
                await manager.create(user_data)
            except UserAlreadyExists:
                pass


async def _seed_default_tags() -> None:
    async with async_session_maker() as session:
        existing = await session.execute(select(Tag).where(Tag.is_default.is_(True)))
        existing_names = {t.name for t in existing.scalars().all()}
        for name in _DEFAULT_TAGS:
            if name not in existing_names:
                session.add(Tag(name=name, is_default=True, user_id=None))
        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS position INTEGER"))
        await conn.execute(text("ALTER TABLE households ADD COLUMN IF NOT EXISTS allergens JSONB"))
        await conn.execute(text("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS auto_substitute BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS personal_allergens JSONB"))
        await conn.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS notes TEXT"))
        await conn.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()"))
        await conn.execute(text("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'en'"))
        await conn.execute(text("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS unit_system VARCHAR(20) NOT NULL DEFAULT 'metric'"))
        await conn.execute(text("ALTER TABLE household_invitations ADD COLUMN IF NOT EXISTS invited_email VARCHAR(320)"))
        await conn.execute(text("ALTER TABLE household_invitations ALTER COLUMN invited_user_id DROP NOT NULL"))
    await _seed_demo_user()
    await _seed_default_tags()
    worker_task = asyncio.create_task(import_worker.run())
    yield
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="PlateKeeper API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_verify_router, prefix="/api/auth", tags=["auth"])
app.include_router(signup_router, prefix="/api/auth", tags=["auth"])
app.include_router(allergens_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(households_router, prefix="/api")
app.include_router(images_router, prefix="/api")
app.include_router(imports_router, prefix="/api")
app.include_router(meal_plan_router, prefix="/api")
app.include_router(preferences_router, prefix="/api")
app.include_router(proxy_router, prefix="/api")
app.include_router(recipes_router, prefix="/api")
app.include_router(shopping_list_router, prefix="/api")
app.include_router(tags_router, prefix="/api")

app.include_router(
    fastapi_users_instance.get_auth_router(auth_backend, requires_verification=True),
    prefix="/api/auth/cookie",
    tags=["auth"],
)
app.include_router(
    fastapi_users_instance.get_auth_router(jwt_backend, requires_verification=True),
    prefix="/api/auth/jwt",
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
