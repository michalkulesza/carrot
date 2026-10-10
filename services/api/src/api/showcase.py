"""Showcase/demo account: a public login (showcase@demo.com) reset to a fixed
default state after an hour of inactivity, so it can be handed out to
recruiters without accumulating junk or getting permanently broken."""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users.exceptions import UserAlreadyExists
from sqlalchemy import delete, select, update

from api.database import async_session_maker
from api.models import (
    Household,
    HouseholdMember,
    ImportJob,
    MealPlanEntry,
    Recipe,
    ShoppingCategory,
    ShoppingListItem,
    Tag,
    UserPreferences,
    recipe_households_table,
    recipe_tags_table,
    user_recipe_favourites_table,
)
from api.routes.households import generate_invite_code
from api.services.related_recipes import add_related_recipes
from api.services.text_sanitizing import sanitize_recipe
from api.users import SHOWCASE_EMAIL, User, UserCreate, UserManager

logger = logging.getLogger(__name__)

SHOWCASE_PASSWORD = "showcase"
SHOWCASE_NICKNAME = "Showcase"
SHOWCASE_HOUSEHOLD_NAME = "Showcase Kitchen"

IDLE_RESET_THRESHOLD = timedelta(hours=1)
CHECK_INTERVAL_SECONDS = 5 * 60

FIXTURE_PATH = Path(__file__).parent / "showcase_fixture.json"

# Meal plan seeded on every reset, as (days relative to the reset date, fixture recipe title),
# so the demo always shows a plan around "today" instead of fixed dates that go stale.
SHOWCASE_MEAL_PLAN: list[tuple[int, str]] = [
    (-1, "Beef Stew"),
    (0, "Chicken and Pesto Rice With Peas"),
    (1, "Beef Stroganoff"),
    (2, "Chicken teriyaki"),
]


def _load_fixture() -> dict:
    if not FIXTURE_PATH.exists():
        return {"recipes": [], "shopping_list_items": []}
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


async def ensure_showcase_user() -> None:
    """Idempotently create the showcase account + its dedicated household, then
    apply the fixture so a fresh deploy starts in the default state without
    waiting for the first idle-reset tick."""
    async with async_session_maker() as session:
        user_db = SQLAlchemyUserDatabase(session, User)
        manager = UserManager(user_db)
        try:
            await manager.create(
                UserCreate(
                    email=SHOWCASE_EMAIL,
                    password=SHOWCASE_PASSWORD,
                    nickname=SHOWCASE_NICKNAME,
                    is_verified=True,
                )
            )
        except UserAlreadyExists:
            pass

        result = await session.execute(select(User).where(User.email == SHOWCASE_EMAIL))
        user = result.scalar_one()

        household_result = await session.execute(
            select(Household).join(HouseholdMember, HouseholdMember.household_id == Household.id).where(
                HouseholdMember.user_id == user.id
            )
        )
        household = household_result.scalars().first()
        if household is None:
            invite_code = await generate_invite_code(session)
            household = Household(name=SHOWCASE_HOUSEHOLD_NAME, invite_code=invite_code)
            session.add(household)
            await session.flush()
            session.add(HouseholdMember(household_id=household.id, user_id=user.id, role="admin"))
            user.active_household_id = household.id

        preferences_result = await session.execute(
            select(UserPreferences).where(UserPreferences.user_id == user.id)
        )
        if preferences_result.scalar_one_or_none() is None:
            session.add(UserPreferences(user_id=user.id))

        await session.commit()

    await reset_showcase_account()


async def reset_showcase_account() -> None:
    """Delete everything owned by the showcase user and re-seed it from the
    committed fixture. Scoped strictly to the showcase user_id so it can never
    touch other accounts' data."""
    fixture = _load_fixture()

    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == SHOWCASE_EMAIL))
        user = result.scalar_one_or_none()
        if user is None:
            return
        user_id = user.id

        household_result = await session.execute(
            select(Household.id).join(HouseholdMember, HouseholdMember.household_id == Household.id).where(
                HouseholdMember.user_id == user_id
            )
        )
        household_id = household_result.scalars().first()

        await session.execute(delete(MealPlanEntry).where(MealPlanEntry.user_id == user_id))
        await session.execute(delete(ShoppingListItem).where(ShoppingListItem.user_id == user_id))
        await session.execute(delete(ImportJob).where(ImportJob.user_id == user_id))
        await session.execute(
            user_recipe_favourites_table.delete().where(user_recipe_favourites_table.c.user_id == user_id)
        )
        await session.execute(delete(Recipe).where(Recipe.author_id == user_id))

        recipe_id_map: dict[str, uuid.UUID] = {}
        for recipe_fixture in fixture.get("recipes", []):
            new_id = uuid.uuid4()
            recipe_id_map[recipe_fixture["fixture_id"]] = new_id
            recipe = Recipe(
                id=new_id,
                author_id=user_id,
                title=recipe_fixture["title"],
                source_title=recipe_fixture.get("source_title"),
                servings=recipe_fixture.get("servings"),
                total_time_minutes=recipe_fixture.get("total_time_minutes"),
                kcal_per_serving=recipe_fixture.get("kcal_per_serving"),
                protein_per_serving=recipe_fixture.get("protein_per_serving"),
                fat_per_serving=recipe_fixture.get("fat_per_serving"),
                carbs_per_serving=recipe_fixture.get("carbs_per_serving"),
                issue_codes=recipe_fixture.get("issue_codes", []),
                nutrition_provenance=recipe_fixture.get("nutrition_provenance", {}),
                nutrition_status=recipe_fixture.get("nutrition_status", "unknown"),
                total_time_provenance=recipe_fixture.get("total_time_provenance", {"status": "unknown"}),
                allergen_status=recipe_fixture.get("allergen_status", "unknown"),
                overview=recipe_fixture.get("overview"),
                title_evidence=recipe_fixture.get("title_evidence", []),
                thumbnail_url=recipe_fixture.get("thumbnail_url"),
                creator_handle=recipe_fixture.get("creator_handle"),
                source_url=recipe_fixture.get("source_url"),
                components=recipe_fixture.get("components", []),
                notes=recipe_fixture.get("notes"),
            )
            sanitize_recipe(recipe)
            session.add(recipe)
            await session.flush()
            if household_id is not None:
                await session.execute(
                    recipe_households_table.insert().values(recipe_id=recipe.id, household_id=household_id)
                )

            tag_names = recipe_fixture.get("tag_names", [])
            if tag_names:
                tag_result = await session.execute(select(Tag).where(Tag.name.in_(tag_names)))
                tags_by_name = {t.name: t for t in tag_result.scalars().all()}
                for name in tag_names:
                    tag = tags_by_name.get(name)
                    if tag is not None:
                        await session.execute(
                            recipe_tags_table.insert().values(recipe_id=recipe.id, tag_id=tag.id)
                        )

        await session.flush()

        # Fixture components reference linked recipes by fixture_id; point them at the re-seeded rows.
        for recipe_fixture in fixture.get("recipes", []):
            parent_id = recipe_id_map[recipe_fixture["fixture_id"]]
            components = recipe_fixture.get("components", [])
            if not any(component.get("linked_recipe_ids") for component in components):
                continue
            remapped = [{**component, "linked_recipe_ids": [
                str(recipe_id_map[linked]) if linked in recipe_id_map else None
                for linked in component.get("linked_recipe_ids") or []
            ]} for component in components]
            await session.execute(update(Recipe).where(Recipe.id == parent_id).values(components=remapped))
            await add_related_recipes(session, parent_id, {
                uuid.UUID(linked) for component in remapped for linked in component["linked_recipe_ids"] if linked
            })

        recipe_id_by_title = {
            recipe_fixture["title"]: recipe_id_map[recipe_fixture["fixture_id"]]
            for recipe_fixture in fixture.get("recipes", [])
        }
        today = datetime.utcnow().date()
        for day_offset, title in SHOWCASE_MEAL_PLAN:
            recipe_id = recipe_id_by_title.get(title)
            if recipe_id is None:
                logger.warning("Showcase meal plan recipe %r not found in fixture", title)
                continue
            session.add(
                MealPlanEntry(
                    user_id=user_id,
                    household_id=household_id,
                    date=today + timedelta(days=day_offset),
                    recipe_id=recipe_id,
                )
            )

        for position, item_fixture in enumerate(fixture.get("shopping_list_items", [])):
            # Older fixtures stored items as plain text strings.
            if isinstance(item_fixture, str):
                item_fixture = {"text": item_fixture}
            session.add(
                ShoppingListItem(
                    user_id=user_id,
                    household_id=household_id,
                    text=item_fixture["text"],
                    category=item_fixture.get("category", ShoppingCategory.OTHER),
                    completed=item_fixture.get("completed", False),
                    position=item_fixture.get("position", position),
                )
            )

        await session.execute(
            update(User).where(User.id == user_id).values(last_activity_at=None)
        )
        await session.commit()

    logger.info("Showcase account reset to default state")


async def maybe_reset_showcase_account() -> None:
    """Only resets if there has been activity (last_activity_at is set) since
    the previous reset, and that activity is now more than an hour stale.
    last_activity_at is cleared by reset_showcase_account, so an untouched
    account is never redundantly reset on every tick."""
    async with async_session_maker() as session:
        result = await session.execute(
            select(User.last_activity_at).where(User.email == SHOWCASE_EMAIL)
        )
        last_activity_at = result.scalar_one_or_none()

    if last_activity_at is None:
        return
    if datetime.utcnow() - last_activity_at < IDLE_RESET_THRESHOLD:
        return

    await reset_showcase_account()


async def run() -> None:
    while True:
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
        try:
            await maybe_reset_showcase_account()
        except Exception:
            logger.exception("Showcase reset loop failed")
