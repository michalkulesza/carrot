"""Backfill legacy recipe unit arrays with deterministic conversions."""

import asyncio
import sys
import uuid

from sqlalchemy import select

from api.database import async_session_maker
from api.models import Recipe
from api.services.unit_variants import build_variants


async def main(recipe_ids: list[uuid.UUID] | None = None) -> None:
    async with async_session_maker() as session:
        query = select(Recipe)
        if recipe_ids:
            query = query.where(Recipe.id.in_(recipe_ids))
        recipes = list((await session.execute(query)).scalars())
        missing = set(recipe_ids or []) - {recipe.id for recipe in recipes}
        if missing:
            raise RuntimeError("Recipes not found: " + ", ".join(map(str, sorted(missing, key=str))))

        for recipe in recipes:
            updated = []
            for component in recipe.components or []:
                ingredients = component.get("ingredients", [])
                steps = component.get("steps", [])
                generated = build_variants(ingredients, steps)
                updated.append({
                    **component,
                    **{
                        field: component.get(field) or values
                        for field, values in generated.items()
                    },
                })
            if updated != recipe.components:
                recipe.components = updated
                await session.commit()
                print(f"Updated {recipe.id}: {recipe.title}")


if __name__ == "__main__":
    asyncio.run(main([uuid.UUID(value) for value in sys.argv[1:]] or None))
