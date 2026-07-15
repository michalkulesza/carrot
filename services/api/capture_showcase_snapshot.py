"""One-off script: run once after manually creating recipes/meal plans/shopping
list items for the showcase@demo.com account through the app UI. Dumps that
account's current data into showcase_fixture.json, which is what
api.showcase.reset_showcase_account() restores on every hourly reset.

Run from services/api/:  uv run python capture_showcase_snapshot.py

Safe to delete after running.
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from sqlalchemy import select  # noqa: E402

from api.database import async_session_maker  # noqa: E402
from api.models import MealPlanEntry, Recipe, ShoppingListItem  # noqa: E402
from api.users import SHOWCASE_EMAIL, User  # noqa: E402


async def main() -> None:
    async with async_session_maker() as session:
        user = (await session.execute(select(User).where(User.email == SHOWCASE_EMAIL))).scalar_one_or_none()
        if user is None:
            print(f"No user found with email {SHOWCASE_EMAIL}. Log in and create it first.")
            return

        recipes = (await session.execute(select(Recipe).where(Recipe.user_id == user.id))).scalars().all()
        meal_plan_entries = (
            (await session.execute(select(MealPlanEntry).where(MealPlanEntry.user_id == user.id))).scalars().all()
        )
        shopping_list_items = (
            (
                await session.execute(
                    select(ShoppingListItem)
                    .where(ShoppingListItem.user_id == user.id)
                    .order_by(ShoppingListItem.position)
                )
            )
            .scalars()
            .all()
        )

        recipe_fixture_ids = {recipe.id: str(recipe.id) for recipe in recipes}

        fixture = {
            "recipes": [
                {
                    "fixture_id": recipe_fixture_ids[recipe.id],
                    "title": recipe.title,
                    "servings": recipe.servings,
                    "kcal_per_serving": recipe.kcal_per_serving,
                    "thumbnail_url": recipe.thumbnail_url,
                    "creator_handle": recipe.creator_handle,
                    "source_url": recipe.source_url,
                    "components": recipe.components,
                    "notes": recipe.notes,
                    "shared_to_personal": recipe.shared_to_personal,
                    "tag_names": [tag.name for tag in recipe.tags],
                }
                for recipe in recipes
            ],
            "meal_plan_entries": [
                {
                    **(
                        {"recipe_fixture_id": recipe_fixture_ids[entry.recipe_id]}
                        if entry.recipe_id in recipe_fixture_ids
                        else {"text": entry.text}
                    ),
                    "date": entry.date.isoformat(),
                }
                for entry in meal_plan_entries
                if entry.recipe_id in recipe_fixture_ids or entry.text
            ],
            "shopping_list_items": [item.text for item in shopping_list_items],
        }

    out_path = Path(__file__).parent / "src" / "api" / "showcase_fixture.json"
    out_path.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(fixture['recipes'])} recipes, {len(fixture['meal_plan_entries'])} meal plan entries, "
          f"{len(fixture['shopping_list_items'])} shopping list items to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
