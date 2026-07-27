import argparse
import asyncio

from sqlalchemy import select

from api.database import async_session_maker
from api.models import Recipe, ShoppingCategory, ShoppingListItem
from api.services.gemini import recommend_shopping_list_categories


def _valid_category(value: object) -> bool:
    try:
        ShoppingCategory(value)
    except (TypeError, ValueError):
        return False
    return True


def _needs_backfill(component: dict) -> bool:
    ingredients = component.get("ingredients") or []
    categories = component.get("shopping_list_categories")
    return (
        not isinstance(categories, list)
        or len(categories) != len(ingredients)
        or any(not _valid_category(category) for category in categories)
    )


def _merged_categories(component: dict, recommendations: list[ShoppingCategory]) -> list[str]:
    current = component.get("shopping_list_categories")
    values = current if isinstance(current, list) else []
    return [
        str(values[index]) if index < len(values) and _valid_category(values[index]) else category.value
        for index, category in enumerate(recommendations)
    ]


async def backfill_recipes(apply: bool) -> None:
    async with async_session_maker() as session:
        recipes = list((await session.scalars(select(Recipe))).all())
        for recipe in recipes:
            components = list(recipe.components or [])
            if not any(_needs_backfill(component) for component in components):
                continue

            updated_components: list[dict] = []
            for component in components:
                normalized = dict(component)
                if _needs_backfill(normalized):
                    ingredients = normalized.get("ingredients") or []
                    try:
                        recommendations = await recommend_shopping_list_categories(ingredients)
                    except Exception as exc:
                        print(f"Skipped recipe {recipe.id}: {recipe.title} ({exc})")
                        break
                    normalized["shopping_list_categories"] = _merged_categories(normalized, recommendations)
                updated_components.append(normalized)
            else:
                print(f"Would backfill recipe {recipe.id}: {recipe.title}")
                if apply:
                    recipe.components = updated_components
                    await session.commit()
                    print(f"Backfilled recipe {recipe.id}: {recipe.title}")


async def backfill_shopping_items(apply: bool) -> None:
    async with async_session_maker() as session:
        items = list((await session.scalars(select(ShoppingListItem))).all())
        invalid_items = [item for item in items if not _valid_category(item.category)]
        if not invalid_items:
            return

        try:
            categories = await recommend_shopping_list_categories([item.text for item in invalid_items])
        except Exception as exc:
            print(f"Skipped shopping-list item batch ({exc})")
            return

        for item, category in zip(invalid_items, categories):
            print(f"Would backfill shopping-list item {item.id}: {item.text}")
            if apply:
                item.category = category
                await session.commit()
                print(f"Backfilled shopping-list item {item.id}: {item.text}")


async def main(apply: bool) -> None:
    await backfill_recipes(apply)
    await backfill_shopping_items(apply)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Populate missing per-ingredient shopping-list categories."
    )
    parser.add_argument("--apply", action="store_true", help="Write changes to the database")
    args = parser.parse_args()
    asyncio.run(main(args.apply))
