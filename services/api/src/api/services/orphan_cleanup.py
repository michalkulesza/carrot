import asyncio
import uuid
from typing import Iterable

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.models import Recipe, recipe_households_table


async def delete_orphan_recipes(session: AsyncSession, recipe_ids: Iterable[uuid.UUID]) -> None:
    ids = list(recipe_ids)
    if not ids:
        return
    has_household_link = exists(
        select(recipe_households_table.c.recipe_id).where(
            recipe_households_table.c.recipe_id == Recipe.id
        )
    )
    result = await session.execute(
        select(Recipe).where(
            Recipe.id.in_(ids),
            Recipe.author_id.is_(None),
            ~has_household_link,
        )
    )
    orphans = result.scalars().all()
    for recipe in orphans:
        thumbnail_url = recipe.thumbnail_url
        await session.delete(recipe)
        if thumbnail_url and settings.r2_configured:
            from api.services import r2

            asyncio.create_task(asyncio.to_thread(r2.delete_image, thumbnail_url))
