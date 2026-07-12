import asyncio

from sqlalchemy import select

from api.database import async_session_maker
from api.models import Recipe
from api.services.gemini import estimate_unit_variants


async def main() -> None:
    async with async_session_maker() as session:
        result = await session.execute(select(Recipe))
        recipes = list(result.scalars())

        for recipe in recipes:
            components = list(recipe.components or [])
            if not components or all(component.get("metric_ingredients") and component.get("imperial_ingredients") for component in components):
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
    asyncio.run(main())
