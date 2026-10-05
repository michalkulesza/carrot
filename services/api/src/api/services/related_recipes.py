"""Shared writer for the symmetric related-recipes table."""

import uuid
from collections.abc import Iterable

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import recipe_related_recipes_table


async def add_related_recipes(session: AsyncSession, recipe_id: uuid.UUID, other_ids: Iterable[uuid.UUID]) -> None:
    """Relate `recipe_id` to each id; pairs are stored ordered and duplicates are ignored."""
    rows = [
        {"recipe_id": min(recipe_id, other_id), "related_recipe_id": max(recipe_id, other_id)}
        for other_id in set(other_ids) if other_id != recipe_id
    ]
    if rows:
        await session.execute(
            pg_insert(recipe_related_recipes_table).on_conflict_do_nothing(index_elements=["recipe_id", "related_recipe_id"]),
            rows,
        )
