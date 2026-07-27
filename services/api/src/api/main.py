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
from api.database import Base, async_session_maker, engine, get_async_session, initialize_vector_schema
from api.models import Recipe, Tag
from api.services.monitoring import init_sentry
from api.services.orphan_cleanup import delete_orphan_recipes
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
from api.routes.public_recipes import router as public_recipes_router
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
                session.add(Tag(name=name, is_default=True, user_id=None, category=category))
            else:
                tag.is_default = True
                tag.user_id = None
                tag.household_id = None
                if tag.category != category:
                    tag.category = category
        await session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        await initialize_vector_schema(conn)
        await conn.execute(text("ALTER TABLE recipe_embeddings ADD COLUMN IF NOT EXISTS dimensions INTEGER NOT NULL DEFAULT 768"))
        await conn.execute(text("ALTER TABLE recipe_embeddings ADD COLUMN IF NOT EXISTS document_version VARCHAR(30) NOT NULL DEFAULT 'v1'"))
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
        await conn.execute(text("ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS recipe_serving_overrides JSONB NOT NULL DEFAULT '{}'::jsonb"))
        await conn.execute(text("ALTER TABLE tags ADD COLUMN IF NOT EXISTS category VARCHAR(20)"))
        await conn.execute(text("ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE tags ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE"))
        await conn.execute(text("ALTER TABLE tags ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE"))
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
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS recipe_related_recipes ("
            "recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, "
            "related_recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, "
            "PRIMARY KEY (recipe_id, related_recipe_id), "
            "CONSTRAINT ck_recipe_related_recipes_order CHECK (recipe_id < related_recipe_id)"
            ")"
        ))
        await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_import_jobs_user_idempotency_key ON import_jobs (user_id, idempotency_key)"))
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS recipe_public_shares ("
            "id UUID PRIMARY KEY, recipe_id UUID NOT NULL UNIQUE REFERENCES recipes(id) ON DELETE CASCADE, "
            "token VARCHAR(128) NOT NULL UNIQUE, created_at TIMESTAMP NOT NULL DEFAULT NOW(), expires_at TIMESTAMP NOT NULL)"
        ))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_recipe_public_shares_token ON recipe_public_shares (token)"))
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS recipe_public_share_library_additions ("
            "id UUID PRIMARY KEY, public_share_id UUID NOT NULL REFERENCES recipe_public_shares(id) ON DELETE CASCADE, "
            "user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, "
            "created_at TIMESTAMP NOT NULL DEFAULT NOW(), CONSTRAINT uq_public_share_library_addition UNIQUE (public_share_id, user_id))"
        ))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_import_jobs_household_status ON import_jobs (household_id, status)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_import_jobs_user_status ON import_jobs (user_id, status)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_import_jobs_next_attempt_at ON import_jobs (next_attempt_at)"))
        await conn.execute(text(
            "INSERT INTO recipe_personal_links (user_id, recipe_id, linked_at) "
            "SELECT user_id, id, updated_at FROM recipes "
            "WHERE household_id IS NOT NULL AND shared_to_personal = TRUE "
            "ON CONFLICT DO NOTHING"
        ))
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

        # households-v2: remove the NULL-household "personal" sentinel; recipes move to an
        # author + m2m household model. See docs/specs/household-v2.md.
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS recipe_households ("
            "recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, "
            "household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE, "
            "added_at TIMESTAMP NOT NULL DEFAULT NOW(), "
            "PRIMARY KEY (recipe_id, household_id))"
        ))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_recipe_households_household_id ON recipe_households (household_id)"))
        await conn.execute(text(
            "INSERT INTO recipe_households (recipe_id, household_id, added_at) "
            "SELECT id, household_id, created_at FROM recipes WHERE household_id IS NOT NULL "
            "ON CONFLICT DO NOTHING"
        ))

        await conn.execute(text(
            "DO $$ BEGIN "
            "IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipes' AND column_name = 'user_id') "
            "THEN ALTER TABLE recipes RENAME COLUMN user_id TO author_id; END IF; "
            "END $$;"
        ))
        await conn.execute(text("ALTER TABLE recipes ALTER COLUMN author_id DROP NOT NULL"))
        await conn.execute(text(
            "DO $$ DECLARE fk_name TEXT; BEGIN "
            "SELECT tc.constraint_name INTO fk_name FROM information_schema.table_constraints tc "
            "JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name "
            "WHERE tc.table_name = 'recipes' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'author_id' LIMIT 1; "
            "IF fk_name IS NOT NULL THEN EXECUTE 'ALTER TABLE recipes DROP CONSTRAINT ' || quote_ident(fk_name); END IF; "
            "END $$;"
        ))
        await conn.execute(text(
            "ALTER TABLE recipes ADD CONSTRAINT recipes_author_id_fkey "
            "FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL"
        ))

        await conn.execute(text("ALTER TABLE households ADD COLUMN IF NOT EXISTS invite_code VARCHAR(8)"))
        await conn.execute(text(
            "DO $$ DECLARE h RECORD; candidate TEXT; BEGIN "
            "FOR h IN SELECT id FROM households WHERE invite_code IS NULL LOOP "
            "LOOP "
            "candidate := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)); "
            "EXIT WHEN NOT EXISTS (SELECT 1 FROM households WHERE invite_code = candidate); "
            "END LOOP; "
            "UPDATE households SET invite_code = candidate WHERE id = h.id; "
            "END LOOP; "
            "END $$;"
        ))
        await conn.execute(text("ALTER TABLE households ALTER COLUMN invite_code SET NOT NULL"))
        await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_households_invite_code ON households (invite_code)"))

        await conn.execute(text("ALTER TABLE household_members ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member'"))
        await conn.execute(text(
            "UPDATE household_members hm SET role = 'admin' "
            "WHERE hm.joined_at = (SELECT MIN(joined_at) FROM household_members WHERE household_id = hm.household_id) "
            "AND NOT EXISTS (SELECT 1 FROM household_members WHERE household_id = hm.household_id AND role = 'admin')"
        ))

        await conn.execute(text("DELETE FROM meal_plan_entries WHERE household_id IS NULL"))
        await conn.execute(text("DROP INDEX IF EXISTS uq_meal_plan_personal"))
        await conn.execute(text("DROP INDEX IF EXISTS uq_meal_plan_household"))
        await conn.execute(text("ALTER TABLE meal_plan_entries ALTER COLUMN household_id SET NOT NULL"))
        await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_meal_plan_household ON meal_plan_entries (household_id, date)"))

        await conn.execute(text("DELETE FROM shopping_list_items WHERE household_id IS NULL"))
        await conn.execute(text("ALTER TABLE shopping_list_items ALTER COLUMN household_id SET NOT NULL"))

        await conn.execute(text("DELETE FROM import_jobs WHERE household_id IS NULL"))
        await conn.execute(text("ALTER TABLE import_jobs ALTER COLUMN household_id SET NOT NULL"))

        await conn.execute(text("DELETE FROM tags WHERE is_default = FALSE AND household_id IS NULL"))

        await conn.execute(text("ALTER TABLE recipes DROP COLUMN IF EXISTS household_id"))
        await conn.execute(text("ALTER TABLE recipes DROP COLUMN IF EXISTS shared_to_personal"))
        await conn.execute(text("ALTER TABLE import_jobs DROP COLUMN IF EXISTS shared_to_personal"))
        await conn.execute(text("ALTER TABLE tags DROP COLUMN IF EXISTS user_id"))
        await conn.execute(text("ALTER TABLE user_preferences DROP COLUMN IF EXISTS share_imports_to_personal"))
        await conn.execute(text("DROP TABLE IF EXISTS recipe_personal_links"))

        # One-time orphan sweep. R2 thumbnails for pre-existing orphans are not purged here —
        # that requires the app-layer helper (services/orphan_cleanup.py) and runs going forward
        # from the routes that can create orphans, not from this SQL migration.
        await conn.execute(text(
            "DELETE FROM recipes WHERE author_id IS NULL "
            "AND NOT EXISTS (SELECT 1 FROM recipe_households WHERE recipe_id = recipes.id)"
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
app.include_router(public_recipes_router, prefix="/api")
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
    authored_result = await session.execute(select(Recipe.id).where(Recipe.author_id == user.id))
    authored_recipe_ids = [row[0] for row in authored_result.all()]

    await user_manager.delete(user)

    # author_id is ON DELETE SET NULL, so household recipes survive for other
    # members — only sweep the ones that are now author-less with no household link.
    await delete_orphan_recipes(session, authored_recipe_ids)
    await session.commit()


app.include_router(me_router, prefix="/api/users", tags=["users"])
app.include_router(
    fastapi_users_instance.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["users"],
)


@app.get("/healthz")
async def health() -> dict[str, str]:
    return {"status": "ok"}
