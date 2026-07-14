import argparse
import asyncio
import uuid

from sqlalchemy import select

from api.database import async_session_maker
from api.models import ImportResult, Ingredient, Recipe, RecipeComponent, RecipeExtraction, UserPreferences
from api.services.import_worker import _get_tags_and_allergens
from api.services.pipeline import run_import_stream


def _flatten_ingredient(ingredient: Ingredient, auto_substitute: bool) -> str:
    name = ingredient.substitute if auto_substitute and ingredient.allergen and ingredient.substitute else ingredient.name
    return " ".join(part for part in (ingredient.qty, ingredient.unit.value if ingredient.unit else None, name) if part)


def _step_ingredient_refs(component: RecipeComponent) -> list[list[dict]] | None:
    if not component.step_refs:
        return None

    refs: list[list[dict]] = [[] for _ in component.steps]
    for ref in component.step_refs:
        if ref.step_index < len(refs):
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
    if result.metadata.debug:
        recipe.debug_model = result.metadata.debug.model
        recipe.debug_input_tokens = result.metadata.debug.input_tokens
        recipe.debug_output_tokens = result.metadata.debug.output_tokens
        recipe.debug_total_tokens = result.metadata.debug.total_tokens


async def _extract(url: str, available_tags: list[str], allergens: list[str]) -> ImportResult:
    result: ImportResult | None = None
    async for event in run_import_stream(url, available_tags=available_tags, allergens=allergens or None):
        if event["type"] == "done":
            result = ImportResult.model_validate(event["result"])

    if result is None or result.recipe is None:
        raise ValueError(result.error if result else "re-import did not return a result")
    return result


async def main(apply: bool, limit: int | None, recipe_ids: set[uuid.UUID]) -> None:
    async with async_session_maker() as session:
        statement = select(Recipe).where(Recipe.source_url.is_not(None), Recipe.source_url != "")
        if recipe_ids:
            statement = statement.where(Recipe.id.in_(recipe_ids))
        if limit is not None:
            statement = statement.limit(limit)
        recipe_ids_to_process = list((await session.scalars(
            statement.order_by(Recipe.created_at).with_only_columns(Recipe.id)
        )).all())

        if not apply:
            print(f"Would re-import {len(recipe_ids_to_process)} URL-backed recipe(s). Run again with --apply to update them.")
            return

        refreshed = 0
        failed = 0
        for recipe_id in recipe_ids_to_process:
            recipe = await session.get(Recipe, recipe_id)
            if recipe is None:
                continue
            recipe_title = recipe.title
            source_url = recipe.source_url
            try:
                available_tags, allergens = await _get_tags_and_allergens(session, recipe.user_id, recipe.household_id)
                result = await _extract(source_url, available_tags, allergens)
                preferences = await session.get(UserPreferences, recipe.user_id)
                _apply_extraction(recipe, result, bool(preferences and preferences.auto_substitute))
                await session.commit()
                refreshed += 1
                print(f"Re-imported {recipe_id}: {recipe.title}")
            except Exception as exc:
                await session.rollback()
                failed += 1
                print(f"Skipped {recipe_id}: {recipe_title} ({source_url}; {exc})")

        print(f"Finished: {refreshed} re-imported, {failed} skipped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Re-import URL-backed recipes in place using the current extraction model and prompt."
    )
    parser.add_argument("--apply", action="store_true", help="Write refreshed extraction results to the database")
    parser.add_argument("--limit", type=int, help="Process at most this many recipes")
    parser.add_argument("--recipe-id", action="append", default=[], help="Only re-import this recipe UUID; repeatable")
    args = parser.parse_args()
    asyncio.run(main(args.apply, args.limit, {uuid.UUID(value) for value in args.recipe_id}))
