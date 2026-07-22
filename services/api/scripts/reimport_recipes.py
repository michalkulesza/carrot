import argparse
import asyncio
import uuid
from collections import defaultdict, deque
from time import monotonic

from sqlalchemy import select

from api.database import async_session_maker
from api.models import ImportResult, Ingredient, Recipe, RecipeComponent, RecipeExtraction, UserPreferences
from api.services.import_worker import _get_tags_and_allergens
from api.services.monitoring import init_sentry
from api.services.pipeline import IMPORT_ERROR_CODE, run_import_stream
from api.services.reimport_scheduler import QueuedRecipe, next_ready_recipe, next_retry_at, recipe_domain


class ReimportFailure(Exception):
    def __init__(self, message: str, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


def _flatten_ingredient(ingredient: Ingredient, auto_substitute: bool) -> str:
    name = ingredient.substitute if auto_substitute and ingredient.allergen and ingredient.substitute else ingredient.name
    return " ".join(part for part in (ingredient.qty, ingredient.unit.value if ingredient.unit else None, name) if part)


def _step_ingredient_refs(component: RecipeComponent) -> list[list[dict]] | None:
    if not component.step_refs:
        return None

    refs: list[list[dict]] = [[] for _ in component.steps]
    for ref in component.step_refs:
        if ref.step_index < len(refs) - 1:
            refs[ref.step_index].append({"ingredient_index": ref.ingredient_index, "mention": ref.mention})
    return refs


def _components(extraction: RecipeExtraction, auto_substitute: bool) -> list[dict]:
    components = []
    for component in extraction.components:
        flattened = [_flatten_ingredient(ingredient, auto_substitute) for ingredient in component.ingredients]
        components.append({
            "name": component.name or component.role,
            "yield_note": component.yield_note or "",
            "ingredients": flattened,
            "shopping_list_ingredients": [
                ingredient.shopping_list_value or display
                for ingredient, display in zip(component.ingredients, flattened)
            ],
            "steps": component.steps,
            "metric_ingredients": component.metric_ingredients or flattened,
            "imperial_ingredients": component.imperial_ingredients or flattened,
            "metric_steps": component.metric_steps or component.steps,
            "imperial_steps": component.imperial_steps or component.steps,
            "ingredient_flags": [{
                "allergen": ingredient.allergen,
                "substitute": ingredient.substitute,
                "substitute_applied": bool(auto_substitute and ingredient.allergen and ingredient.substitute),
                "original_display": None,
            } for ingredient in component.ingredients],
            "step_ingredient_refs": _step_ingredient_refs(component),
        })
    return components


def _apply_extraction(recipe: Recipe, result: ImportResult, auto_substitute: bool) -> None:
    extraction = result.recipe
    if extraction is None:
        raise ValueError("re-import produced no recipe")

    recipe.title = extraction.title or recipe.title
    recipe.servings = extraction.servings
    recipe.total_time_minutes = extraction.total_time_minutes
    recipe.kcal_per_serving = extraction.kcal_per_serving
    recipe.protein_per_serving = extraction.protein_per_serving
    recipe.fat_per_serving = extraction.fat_per_serving
    recipe.carbs_per_serving = extraction.carbs_per_serving
    recipe.components = _components(extraction, auto_substitute)

    if result.metadata.thumbnail_url:
        recipe.thumbnail_url = result.metadata.thumbnail_url
    if result.metadata.creator_handle:
        recipe.creator_handle = result.metadata.creator_handle
    if result.metadata.source_url:
        recipe.source_url = result.metadata.source_url


async def _extract(url: str, available_tags: list[str], allergens: list[str]) -> ImportResult:
    result: ImportResult | None = None
    async for event in run_import_stream(url, available_tags=available_tags, allergens=allergens or None):
        if event["type"] == "done":
            result = ImportResult.model_validate(event["result"])

    if result is None or result.recipe is None:
        error = result.error if result else "re-import did not return a result"
        raise ReimportFailure(error, retryable=error == IMPORT_ERROR_CODE)
    return result


async def _reimport_recipe(recipe_id: uuid.UUID) -> tuple[bool, bool, str]:
    async with async_session_maker() as session:
        recipe = await session.get(Recipe, recipe_id)
        if recipe is None:
            return False, False, f"Skipped {recipe_id}: recipe no longer exists"

        recipe_title = recipe.title
        source_url = recipe.source_url
        try:
            available_tags, allergens = await _get_tags_and_allergens(session, recipe.user_id, recipe.household_id)
            result = await _extract(source_url, available_tags, allergens)
            preferences = await session.get(UserPreferences, recipe.user_id)
            _apply_extraction(recipe, result, bool(preferences and preferences.auto_substitute))
            await session.commit()
            return True, False, f"Re-imported {recipe_id}: {recipe.title}"
        except ReimportFailure as exc:
            await session.rollback()
            return False, exc.retryable, f"Skipped {recipe_id}: {recipe_title} ({source_url}; {exc})"
        except Exception as exc:
            await session.rollback()
            return False, False, f"Skipped {recipe_id}: {recipe_title} ({source_url}; {exc})"


async def main(
    apply: bool,
    limit: int | None,
    recipe_ids: set[uuid.UUID],
    retry_delay_seconds: int,
    max_retries: int,
) -> None:
    async with async_session_maker() as session:
        statement = select(Recipe.id, Recipe.source_url).where(Recipe.source_url.is_not(None), Recipe.source_url != "")
        if recipe_ids:
            statement = statement.where(Recipe.id.in_(recipe_ids))
        if limit is not None:
            statement = statement.limit(limit)
        recipe_rows = list((await session.execute(statement.order_by(Recipe.created_at))).all())

    if not apply:
        print(f"Would re-import {len(recipe_rows)} URL-backed recipe(s). Run again with --apply to update them.")
        return

    recipes_by_domain: dict[str, deque[QueuedRecipe]] = defaultdict(deque)
    domain_order: deque[str] = deque()
    for recipe_id, source_url in recipe_rows:
        domain = recipe_domain(source_url)
        if not recipes_by_domain[domain]:
            domain_order.append(domain)
        recipes_by_domain[domain].append(QueuedRecipe(recipe_id=recipe_id, domain=domain))

    refreshed = 0
    failed = 0
    while any(recipes_by_domain.values()):
        now = monotonic()
        queued_recipe = next_ready_recipe(domain_order, recipes_by_domain, now)
        if queued_recipe is None:
            retry_at = next_retry_at(recipes_by_domain)
            if retry_at is None:
                break
            delay = max(0, retry_at - now)
            print(f"All remaining recipes are cooling down; waiting {delay:.0f} seconds before retrying.")
            await asyncio.sleep(delay)
            continue

        succeeded, retryable, message = await _reimport_recipe(queued_recipe.recipe_id)
        print(message)
        if succeeded:
            refreshed += 1
        elif retryable and queued_recipe.retries < max_retries:
            queued_recipe.retries += 1
            queued_recipe.retry_at = monotonic() + retry_delay_seconds
            recipes_by_domain[queued_recipe.domain].append(queued_recipe)
            print(
                f"Deferring {queued_recipe.recipe_id} after a transient source failure "
                f"(retry {queued_recipe.retries}/{max_retries})."
            )
        else:
            failed += 1

    print(f"Finished: {refreshed} re-imported, {failed} skipped.")


if __name__ == "__main__":
    init_sentry()
    parser = argparse.ArgumentParser(
        description="Re-import URL-backed recipes in place using the current extraction model and prompt."
    )
    parser.add_argument("--apply", action="store_true", help="Write refreshed extraction results to the database")
    parser.add_argument("--limit", type=int, help="Process at most this many recipes")
    parser.add_argument("--recipe-id", action="append", default=[], help="Only re-import this recipe UUID; repeatable")
    parser.add_argument("--retry-delay-seconds", type=int, default=60, help="Cooldown before retrying a rate-limited source (default: 60)")
    parser.add_argument("--max-retries", type=int, default=3, help="Retries for a transient source failure (default: 3)")
    args = parser.parse_args()
    if args.retry_delay_seconds < 1:
        parser.error("--retry-delay-seconds must be at least 1")
    if args.max_retries < 0:
        parser.error("--max-retries must be at least 0")
    asyncio.run(main(
        args.apply,
        args.limit,
        {uuid.UUID(value) for value in args.recipe_id},
        args.retry_delay_seconds,
        args.max_retries,
    ))
