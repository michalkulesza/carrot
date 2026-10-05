"""One-off script: run once after manually creating recipes/shopping list items
for the showcase@demo.com account through the app UI. Dumps that account's
current data into showcase_fixture.json, which is what
api.showcase.reset_showcase_account() restores on every hourly reset. The meal
plan is not captured; it is seeded from SHOWCASE_MEAL_PLAN in api.showcase.

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
from api.models import Recipe, ShoppingListItem  # noqa: E402
from api.users import SHOWCASE_EMAIL, User  # noqa: E402


async def main() -> None:
    async with async_session_maker() as session:
        user = (await session.execute(select(User).where(User.email == SHOWCASE_EMAIL))).scalar_one_or_none()
        if user is None:
            print(f"No user found with email {SHOWCASE_EMAIL}. Log in and create it first.")
            return

        recipes = (await session.execute(select(Recipe).where(Recipe.author_id == user.id))).scalars().all()
        shopping_list_items = (
            (
                await session.execute(
                    select(ShoppingListItem)
                    .where(ShoppingListItem.user_id == user.id)
                    .order_by(ShoppingListItem.category, ShoppingListItem.position, ShoppingListItem.created_at)
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
                    "source_title": recipe.source_title,
                    "servings": recipe.servings,
                    "total_time_minutes": recipe.total_time_minutes,
                    "kcal_per_serving": recipe.kcal_per_serving,
                    "protein_per_serving": recipe.protein_per_serving,
                    "fat_per_serving": recipe.fat_per_serving,
                    "carbs_per_serving": recipe.carbs_per_serving,
                    "issue_codes": recipe.issue_codes,
                    "nutrition_provenance": recipe.nutrition_provenance,
                    "nutrition_status": recipe.nutrition_status,
                    "total_time_provenance": recipe.total_time_provenance,
                    "allergen_status": recipe.allergen_status,
                    "overview": recipe.overview,
                    "title_evidence": recipe.title_evidence,
                    "thumbnail_url": recipe.thumbnail_url,
                    "creator_handle": recipe.creator_handle,
                    "source_url": recipe.source_url,
                    "components": recipe.components,
                    "notes": recipe.notes,
                    "tag_names": [tag.name for tag in recipe.tags],
                }
                for recipe in recipes
            ],
            "shopping_list_items": [
                {
                    "text": item.text,
                    "category": item.category,
                    "completed": item.completed,
                    "position": item.position,
                }
                for item in shopping_list_items
            ],
        }

    out_path = Path(__file__).parent / "src" / "api" / "showcase_fixture.json"
    out_path.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(fixture['recipes'])} recipes, "
          f"{len(fixture['shopping_list_items'])} shopping list items to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
