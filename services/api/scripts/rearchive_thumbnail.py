import argparse
import asyncio
import uuid

from api.database import async_session_maker
from api.models import Recipe
from api.services.import_worker import _archive_thumbnail
from api.services.monitoring import init_sentry


async def main(recipe_id: uuid.UUID) -> None:
    async with async_session_maker() as session:
        recipe = await session.get(Recipe, recipe_id)
        if recipe is None:
            print(f"Recipe {recipe_id} not found.")
            return

        previous = recipe.thumbnail_url
        await _archive_thumbnail(recipe)
        if recipe.thumbnail_url == previous:
            print(f"Thumbnail unchanged for {recipe_id}: {previous}")
            return

        await session.commit()
        print(f"Archived thumbnail for {recipe_id}: {previous} -> {recipe.thumbnail_url}")


if __name__ == "__main__":
    init_sentry()
    parser = argparse.ArgumentParser(description="Re-archive a recipe's external thumbnail to R2.")
    parser.add_argument("recipe_id", type=uuid.UUID)
    args = parser.parse_args()
    asyncio.run(main(args.recipe_id))
