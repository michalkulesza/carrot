import asyncio
import re
import sys
import uuid

from sqlalchemy import select

from api import users
from api.database import async_session_maker
from api.models import Recipe
from api.services.gemini import estimate_unit_variants

_PIECE_UNIT = re.compile(r"^([\d¼½¾⅓⅔⅛⅜⅝⅞.,/]+)\s+piece\s+", re.IGNORECASE)


def _remove_piece_unit(value: str) -> str:
    return _PIECE_UNIT.sub(r"\1 ", value).strip()


async def main(recipe_ids: list[uuid.UUID] | None = None) -> None:
    async with async_session_maker() as session:
        query = select(Recipe)
        if recipe_ids:
            query = query.where(Recipe.id.in_(recipe_ids))

        result = await session.execute(query)
        recipes = list(result.scalars())
        found_ids = {recipe.id for recipe in recipes}
        missing_ids = set(recipe_ids or []) - found_ids
        if missing_ids:
            missing = ", ".join(str(recipe_id) for recipe_id in sorted(missing_ids, key=str))
            raise RuntimeError(f"Recipes not found: {missing}")

        for recipe in recipes:
            components = list(recipe.components or [])
            if not components:
                continue

            normalized = []
            for component in components:
                normalized_component = dict(component)
                for field in ("ingredients", "metric_ingredients", "imperial_ingredients"):
                    values = normalized_component.get(field)
                    if values:
                        normalized_component[field] = [_remove_piece_unit(value) for value in values]
                normalized.append(normalized_component)

            components = normalized
            has_variants = all(component.get("metric_ingredients") and component.get("imperial_ingredients") for component in components)
            if has_variants:
                if components != recipe.components:
                    recipe.components = components
                    await session.commit()
                    print(f"Removed piece units from {recipe.id}: {recipe.title}")
                continue

            source = [
                {
                    "name": component.get("name", ""),
                    "ingredients": component.get("ingredients", []),
                    "steps": component.get("steps", []),
                }
                for component in components
            ]
            variants = await estimate_unit_variants(source)
            if len(variants.components) != len(components):
                raise RuntimeError(f"Unit conversion returned the wrong component count for {recipe.id}")

            updated = []
            for component, variant in zip(components, variants.components):
                if len(variant.metric_ingredients) != len(component.get("ingredients", [])):
                    raise RuntimeError(f"Unit conversion returned the wrong ingredient count for {recipe.id}")
                if len(variant.metric_steps) != len(component.get("steps", [])):
                    raise RuntimeError(f"Unit conversion returned the wrong step count for {recipe.id}")
                updated.append({
                    **component,
                    "metric_ingredients": variant.metric_ingredients,
                    "imperial_ingredients": variant.imperial_ingredients,
                    "metric_steps": variant.metric_steps,
                    "imperial_steps": variant.imperial_steps,
                })
            recipe.components = updated
            await session.commit()
            print(f"Backfilled {recipe.id}: {recipe.title}")


if __name__ == "__main__":
    requested_ids = [uuid.UUID(value) for value in sys.argv[1:]]
    asyncio.run(main(requested_ids or None))
