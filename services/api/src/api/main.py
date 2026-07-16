import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from fastapi_users.exceptions import UserAlreadyExists
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.database import Base, async_session_maker, engine, get_async_session
from api.models import Recipe, Tag
from api.services import r2
from api.services.monitoring import init_sentry
from api.routes.auth import router as auth_verify_router
from api.routes.allergens import router as allergens_router
from api.routes.export import router as export_router
from api.routes.google_auth import router as google_auth_router
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
from api import showcase
from api.users import (
    UserCreate,
    UserManager,
    UserRead,
    UserUpdate,
    auth_backend,
    current_active_user,
    fastapi_users_instance,
    get_user_manager,
    jwt_backend,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from api.users import User

logging.basicConfig(level=logging.DEBUG)

_DEFAULT_TAGS: list[tuple[str, str | None]] = [
    # Diet
    ("Vegetarian", None), ("Vegan", None), ("Gluten-Free", None), ("Dairy-Free", None),
    ("Keto", None), ("Low-Carb", None),
    # Meal type
    ("Breakfast", None), ("Lunch", None), ("Dinner", None), ("Snack", None), ("Dessert", None), ("Drink", None),
    # Method
    ("Grilled", None), ("Baked", None), ("One-Pot", None),
    # Other
    ("High-Protein", None), ("Comfort Food", None),
    # Protein
    ("Chicken", "protein"), ("Beef", "protein"), ("Pork", "protein"), ("Fish", "protein"),
    ("Seafood", "protein"), ("Turkey", "protein"), ("Tofu", "protein"), ("Eggs", "protein"),
    # Carb
    ("Potatoes", "carb"), ("Rice", "carb"), ("Pasta", "carb"), ("Bread", "carb"), ("Noodles", "carb"),
    # Cuisine
    ("Italian", "cuisine"), ("Asian", "cuisine"), ("Mexican", "cuisine"), ("Indian", "cuisine"),
    ("Mediterranean", "cuisine"), ("French", "cuisine"), ("American", "cuisine"),
    # Time
    ("Quick", "time"), ("Medium", "time"), ("Long", "time"),
]


async def _seed_demo_user() -> None:
    async with async_session_maker() as session:
        user_db = SQLAlchemyUserDatabase(session, User)
        manager = UserManager(user_db)
        for user_data in [
            UserCreate(email="demo@demo.com", password="demo1234", nickname="justahacker", is_verified=True),
            UserCreate(email="alt@demo.com", password="demo1234", nickname="Demo Alt", is_verified=True),
        ]:
            try:
                await manager.create(user_data)
            except UserAlreadyExists:
                pass


async def _seed_default_tags() -> None:
    async with async_session_maker() as session:
        existing = await session.execute(select(Tag))
        existing_by_name = {t.name: t for t in existing.scalars().all()}
        for name, category in _DEFAULT_TAGS:
            tag = existing_by_name.get(name)
            if tag is None:
                session.add(Tag(name=name, category=category))
            elif tag.category != category:
                tag.category = category
        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS position INTEGER"))
        await conn.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS total_time_minutes INTEGER"))
        await conn.execute(text("ALTER TABLE households ADD COLUMN IF NOT EXISTS allergens JSONB"))
        await conn.execute(text("ALTER TABLE households ALTER COLUMN allergens TYPE JSONB USING allergens::jsonb"))
        await conn.execute(text("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS auto_substitute BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS personal_allergens JSONB"))
        await conn.execute(text("ALTER TABLE user_preferences ALTER COLUMN personal_allergens TYPE JSONB USING personal_allergens::jsonb"))
        await conn.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS notes TEXT"))
        await conn.execute(text("ALTER TABLE recipes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()"))
        await conn.execute(text("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'en'"))
        await conn.execute(text("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS unit_system VARCHAR(20) NOT NULL DEFAULT 'metric'"))
        await conn.execute(text("ALTER TABLE household_invitations ADD COLUMN IF NOT EXISTS invited_email VARCHAR(320)"))
        await conn.execute(text("ALTER TABLE household_invitations ALTER COLUMN invited_user_id DROP NOT NULL"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_account BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS share_imports_to_personal BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE tags ADD COLUMN IF NOT EXISTS category VARCHAR(20)"))
        await conn.execute(text("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE"))
        await conn.execute(text("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS idempotency_key UUID"))
        await conn.execute(text("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS shared_to_personal BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS failure_code VARCHAR(64)"))
        await conn.execute(text("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS diagnostic_error VARCHAR"))
        await conn.execute(text("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0"))
        await conn.execute(text("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP"))
        await conn.execute(text("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP"))
        await conn.execute(text("ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMP"))
        await conn.execute(text("ALTER TABLE import_jobs ALTER COLUMN attempts SET DEFAULT 0"))
        await conn.execute(text("ALTER TABLE import_jobs ALTER COLUMN model DROP NOT NULL"))
        await conn.execute(text("ALTER TABLE import_jobs ALTER COLUMN model DROP DEFAULT"))
        await conn.execute(text("ALTER TABLE meal_plan_entries ALTER COLUMN recipe_id DROP NOT NULL"))
        await conn.execute(text("ALTER TABLE meal_plan_entries ADD COLUMN IF NOT EXISTS text VARCHAR(200)"))
        await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_import_jobs_user_idempotency_key ON import_jobs (user_id, idempotency_key)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_import_jobs_household_status ON import_jobs (household_id, status)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_import_jobs_user_status ON import_jobs (user_id, status)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_import_jobs_next_attempt_at ON import_jobs (next_attempt_at)"))
        await conn.execute(text(
            "INSERT INTO recipe_personal_links (user_id, recipe_id, linked_at) "
            "SELECT user_id, id, updated_at FROM recipes "
            "WHERE household_id IS NOT NULL AND shared_to_personal = TRUE "
            "ON CONFLICT DO NOTHING"
        ))
        # Tags are predefined-only now — drop the custom-tag ownership columns,
        # discarding any stray non-default rows created before this change.
        await conn.execute(text(
            "DO $$ BEGIN "
            "IF EXISTS (SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'tags' AND column_name = 'is_default') THEN "
            "DELETE FROM tags WHERE is_default = FALSE; "
            "END IF; "
            "END $$"
        ))
        await conn.execute(text("ALTER TABLE tags DROP COLUMN IF EXISTS is_default"))
        await conn.execute(text("ALTER TABLE tags DROP COLUMN IF EXISTS user_id"))
        await conn.execute(text("ALTER TABLE tags DROP COLUMN IF EXISTS household_id"))
        # Allergen preferences are predefined-only now — flatten the old
        # {predefined, custom} shape into a plain array of keys.
        await conn.execute(text(
            "UPDATE households SET allergens = "
            "COALESCE(allergens->'predefined', '[]'::jsonb) || COALESCE(allergens->'custom', '[]'::jsonb) "
            "WHERE allergens IS NOT NULL AND jsonb_typeof(allergens) = 'object'"
        ))
        await conn.execute(text(
            "UPDATE user_preferences SET personal_allergens = "
            "COALESCE(personal_allergens->'predefined', '[]'::jsonb) || COALESCE(personal_allergens->'custom', '[]'::jsonb) "
            "WHERE personal_allergens IS NOT NULL AND jsonb_typeof(personal_allergens) = 'object'"
        ))
    await _seed_demo_user()
    await _seed_default_tags()
    await showcase.ensure_showcase_user()
    showcase_task = asyncio.create_task(showcase.run())
    yield
    showcase_task.cancel()
    for task in (showcase_task,):
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Carrot API", lifespan=lifespan)
init_sentry()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_verify_router, prefix="/api/auth", tags=["auth"])
app.include_router(signup_router, prefix="/api/auth", tags=["auth"])
app.include_router(google_auth_router, prefix="/api/auth", tags=["auth"])
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
me_router = APIRouter()


@me_router.get("/me", response_model=UserRead)
async def get_me(user: User = Depends(current_active_user)) -> User:
    return user


@me_router.patch("/me", response_model=UserRead)
async def update_me(
    user_update: UserUpdate,
    user: User = Depends(current_active_user),
    user_manager: UserManager = Depends(get_user_manager),
) -> User:
    return await user_manager.update(user_update, user, safe=True)


@me_router.delete("/me", status_code=204)
async def delete_me(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
) -> None:
    if settings.r2_configured:
        result = await session.execute(select(Recipe.thumbnail_url).where(Recipe.user_id == user.id))
        for (thumbnail_url,) in result.all():
            if thumbnail_url:
                asyncio.create_task(asyncio.to_thread(r2.delete_image, thumbnail_url))
    await user_manager.delete(user)


app.include_router(me_router, prefix="/api/users", tags=["users"])
app.include_router(
    fastapi_users_instance.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["users"],
)


@app.get("/healthz")
async def health() -> dict[str, str]:
    return {"status": "ok"}
