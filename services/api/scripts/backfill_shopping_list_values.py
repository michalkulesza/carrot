import argparse
import asyncio

from sqlalchemy import select

from api import users
from api.database import async_session_maker
from api.models import Recipe
from api.services.gemini import recommend_shopping_list_values


def _needs_backfill(component: dict) -> bool:
    ingredients = component.get("ingredients") or []
    values = component.get("shopping_list_ingredients")
    return (
        not isinstance(values, list)
        or len(values) != len(ingredients)
        or any(not isinstance(value, str) or not value.strip() for value in values)
    )


async def main(apply: bool) -> None:
    async with async_session_maker() as session:
        result = await session.execute(select(Recipe))
        recipes = list(result.scalars())

        for recipe in recipes:
            components = list(recipe.components or [])
            if not any(_needs_backfill(component) for component in components):
                continue

            updated = []
            failed = False
            for component in components:
                normalized = dict(component)
                ingredients = normalized.get("ingredients") or []
                if _needs_backfill(normalized):
                    try:
                        normalized["shopping_list_ingredients"] = await recommend_shopping_list_values(
                            ingredients,
                            model="gemini-3.1-flash-lite",
                        )
                    except Exception as exc:
                        print(f"Skipped {recipe.id}: {recipe.title} ({exc})")
                        failed = True
                        break
                updated.append(normalized)

            if failed:
                continue

            print(f"Would backfill {recipe.id}: {recipe.title}")
            if apply:
                recipe.components = updated
                await session.commit()
                print(f"Backfilled {recipe.id}: {recipe.title}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Populate missing per-ingredient shopping-list values."
    )
    parser.add_argument("--apply", action="store_true", help="Write changes to the database")
    args = parser.parse_args()
    asyncio.run(main(args.apply))
