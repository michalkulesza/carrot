from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.broadcaster import broadcaster
from api.database import async_session_maker
from api.models import (
    Household,
    HouseholdMember,
    Recipe,
    RecipeAllergenCheck,
    UserPreferences,
    recipe_households_table,
)
from api.routes.context import get_scope_key
from api.services import gemini as gemini_svc
from api.services import linked_recipes
from api.services.monitoring import report_service_failure

log = logging.getLogger(__name__)

PENDING = "pending"
RUNNING = "running"
SUCCEEDED = "succeeded"
FAILED = "failed"


async def enqueue_recipe_allergen_check(session: AsyncSession, recipe_id: uuid.UUID) -> None:
    """Coalesce duplicate requests while retaining a newer request made mid-check."""
    now = datetime.utcnow()
    await session.execute(
        pg_insert(RecipeAllergenCheck)
        .values(recipe_id=recipe_id, status=PENDING, revision=1, requested_at=now)
        .on_conflict_do_update(
            index_elements=["recipe_id"],
            set_={
                "status": PENDING,
                "revision": RecipeAllergenCheck.revision + 1,
                "requested_at": now,
                "completed_at": None,
                "last_error": None,
            },
        )
    )


async def enqueue_household_allergen_checks(session: AsyncSession, household_id: uuid.UUID) -> int:
    recipe_ids = (await session.scalars(
        select(recipe_households_table.c.recipe_id).where(recipe_households_table.c.household_id == household_id)
    )).all()
    for recipe_id in recipe_ids:
        await enqueue_recipe_allergen_check(session, recipe_id)
    return len(recipe_ids)


async def enqueue_user_allergen_checks(session: AsyncSession, user_id: uuid.UUID) -> int:
    household_ids = select(HouseholdMember.household_id).where(HouseholdMember.user_id == user_id)
    recipe_ids = (await session.scalars(
        select(Recipe.id).where(
            (Recipe.author_id == user_id)
            | Recipe.id.in_(select(recipe_households_table.c.recipe_id).where(recipe_households_table.c.household_id.in_(household_ids)))
        ).distinct()
    )).all()
    for recipe_id in recipe_ids:
        await enqueue_recipe_allergen_check(session, recipe_id)
    return len(recipe_ids)


def _ingredient_snapshot(components: list[dict]) -> str:
    inputs = []
    for component in components:
        ingredients = component.get("ingredients", [])
        flags = component.get("ingredient_flags", []) or []
        inputs.append([
            {
                "ingredient": ingredient,
                "substitute_applied": bool(flags[index].get("substitute_applied")) if index < len(flags) and flags[index] else False,
                "original_display": flags[index].get("original_display") if index < len(flags) and flags[index] else None,
            }
            for index, ingredient in enumerate(ingredients)
        ])
    return hashlib.sha256(json.dumps(inputs, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def _analysis_ingredients(component: dict) -> list[str]:
    flags = component.get("ingredient_flags", []) or []
    return [
        flags[index].get("original_display")
        if index < len(flags) and flags[index] and flags[index].get("substitute_applied") and flags[index].get("original_display")
        else ingredient
        for index, ingredient in enumerate(component.get("ingredients", []))
    ]


async def _allergens_for_recipe(session: AsyncSession, recipe: Recipe) -> list[str]:
    household_ids = (await session.scalars(
        select(recipe_households_table.c.household_id).where(recipe_households_table.c.recipe_id == recipe.id)
    )).all()
    allergens: set[str] = set()
    if recipe.author_id is not None:
        prefs = await session.get(UserPreferences, recipe.author_id)
        allergens.update(prefs.personal_allergens or [] if prefs else [])
    if household_ids:
        households = (await session.scalars(select(Household).where(Household.id.in_(household_ids)))).all()
        for household in households:
            allergens.update(household.allergens or [])
        member_ids = (await session.scalars(
            select(HouseholdMember.user_id).where(HouseholdMember.household_id.in_(household_ids))
        )).all()
        preferences = (await session.scalars(select(UserPreferences).where(UserPreferences.user_id.in_(member_ids)))).all()
        for prefs in preferences:
            allergens.update(prefs.personal_allergens or [])
    return sorted(allergens)


async def _publish_recipe_changed(session: AsyncSession, recipe_id: uuid.UUID) -> None:
    household_ids = (await session.scalars(
        select(recipe_households_table.c.household_id).where(recipe_households_table.c.recipe_id == recipe_id)
    )).all()
    for household_id in household_ids:
        await broadcaster.publish(get_scope_key("recipes", uuid.UUID(int=0), household_id), {
            "type": "recipe_changed", "id": str(recipe_id),
        })


async def _claim() -> tuple[uuid.UUID, int] | None:
    async with async_session_maker() as session:
        job = await session.scalar(
            select(RecipeAllergenCheck)
            .where(RecipeAllergenCheck.status == PENDING)
            .order_by(RecipeAllergenCheck.requested_at)
            .with_for_update(skip_locked=True)
        )
        if job is None:
            return None
        job.status = RUNNING
        job.started_at = datetime.utcnow()
        await session.commit()
        return job.recipe_id, job.revision


async def _process(recipe_id: uuid.UUID, revision: int) -> None:
    try:
        async with async_session_maker() as session:
            recipe = await session.get(Recipe, recipe_id)
            if recipe is None:
                return
            components = list(recipe.components or [])
            snapshot = _ingredient_snapshot(components)
            allergens = await _allergens_for_recipe(session, recipe)

        flags_by_component = []
        for component in components:
            ingredients = _analysis_ingredients(component)
            flags = await gemini_svc.analyze_allergens(ingredients, allergens)
            flags_by_component.append([flag.model_dump() for flag in flags])

        async with async_session_maker() as session:
            job = await session.scalar(
                select(RecipeAllergenCheck).where(RecipeAllergenCheck.recipe_id == recipe_id).with_for_update()
            )
            recipe = await session.get(Recipe, recipe_id, with_for_update=True)
            if job is None or recipe is None:
                return
            if job.revision != revision or _ingredient_snapshot(recipe.components or []) != snapshot:
                job.status = PENDING
                job.requested_at = datetime.utcnow()
                await session.commit()
                return
            refreshed = []
            for component, flags in zip(recipe.components or [], flags_by_component):
                value = dict(component)
                previous_flags = component.get("ingredient_flags", []) or []
                value["ingredient_flags"] = [
                    {
                        **(previous_flags[index] if index < len(previous_flags) and previous_flags[index] else {}),
                        "allergen": flag.get("allergen"),
                        "substitute": flag.get("substitute"),
                        "substitute_applied": bool(previous_flags[index].get("substitute_applied")) if index < len(previous_flags) and previous_flags[index] else False,
                        "original_display": previous_flags[index].get("original_display") if index < len(previous_flags) and previous_flags[index] else None,
                    }
                    for index, flag in enumerate(flags)
                ]
                refreshed.append(value)
            summary_before = (recipe.allergen_status, linked_recipes.recipe_allergens(recipe.components or []))
            recipe.components, recipe.allergen_status = await linked_recipes.resolve_linked_allergens(session, refreshed, recipe.source_url)
            if summary_before != (recipe.allergen_status, linked_recipes.recipe_allergens(recipe.components)):
                # Only a changed summary propagates, which stops A <-> B links from rechecking forever.
                for parent_id in await linked_recipes.parent_recipe_ids(session, recipe_id):
                    await enqueue_recipe_allergen_check(session, parent_id)
            job.status = SUCCEEDED
            job.completed_at = datetime.utcnow()
            job.last_error = None
            await session.commit()
            await _publish_recipe_changed(session, recipe_id)
    except Exception as error:
        log.warning("Allergen recheck failed for recipe %s: %s", recipe_id, type(error).__name__)
        report_service_failure("allergen_recheck", error=error)
        async with async_session_maker() as session:
            job = await session.scalar(select(RecipeAllergenCheck).where(RecipeAllergenCheck.recipe_id == recipe_id).with_for_update())
            if job is not None and job.revision == revision:
                job.status = FAILED
                job.last_error = type(error).__name__
                job.completed_at = datetime.utcnow()
                await session.commit()


async def worker_loop(poll_interval_seconds: float) -> None:
    while True:
        claimed = await _claim()
        if claimed is None:
            await asyncio.sleep(poll_interval_seconds)
            continue
        await _process(*claimed)


async def recover_running_jobs() -> None:
    """A worker may be restarted while Gemini is running; make those jobs claimable again."""
    async with async_session_maker() as session:
        await session.execute(
            update(RecipeAllergenCheck)
            .where(RecipeAllergenCheck.status == RUNNING)
            .values(status=PENDING, requested_at=datetime.utcnow(), started_at=None)
        )
        await session.commit()


async def household_recheck_status(session: AsyncSession, household_id: uuid.UUID) -> dict[str, int | bool]:
    rows = (await session.execute(
        select(RecipeAllergenCheck.status, func.count())
        .join(recipe_households_table, recipe_households_table.c.recipe_id == RecipeAllergenCheck.recipe_id)
        .where(recipe_households_table.c.household_id == household_id)
        .group_by(RecipeAllergenCheck.status)
    )).all()
    counts = {status: count for status, count in rows}
    pending = counts.get(PENDING, 0)
    running = counts.get(RUNNING, 0)
    failed = counts.get(FAILED, 0)
    completed = counts.get(SUCCEEDED, 0)
    return {"total": pending + running + failed + completed, "pending": pending, "running": running, "failed": failed, "completed": completed, "done": pending + running == 0}
