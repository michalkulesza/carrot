from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime
from typing import Any

from google import genai
from google.genai import types
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import settings
from api.models import EmbeddingStatus, Recipe, RecipeEmbedding

log = logging.getLogger(__name__)


def _component_document(component: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": component.get("name"),
        "ingredients": component.get("ingredients", []),
        "steps": component.get("steps", []),
    }


def build_embedding_document(recipe: Recipe) -> str:
    payload = {
        "title": recipe.title,
        "tags": sorted(tag.name for tag in recipe.tags),
        "components": [_component_document(component) for component in recipe.components or []],
        "notes": recipe.notes,
        "total_time_minutes": recipe.total_time_minutes,
        "nutrition": {
            "kcal_per_serving": recipe.kcal_per_serving,
            "protein_per_serving": recipe.protein_per_serving,
            "fat_per_serving": recipe.fat_per_serving,
            "carbs_per_serving": recipe.carbs_per_serving,
        },
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def embedding_document_hash(document: str) -> str:
    return hashlib.sha256(document.encode("utf-8")).hexdigest()


def _vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(str(value) for value in vector) + "]"


def _embedding_values(response: Any) -> list[float]:
    embeddings = getattr(response, "embeddings", None) or []
    values = getattr(embeddings[0], "values", None) if embeddings else None
    if not isinstance(values, list) or len(values) != settings.gemini_embedding_dimensions:
        length = len(values) if isinstance(values, list) else 0
        raise ValueError(f"invalid embedding vector length: {length}")
    return [float(value) for value in values]


async def generate_embedding(document: str, task_type: str) -> list[float]:
    if not settings.semantic_search_enabled or not settings.gemini_api_key:
        raise RuntimeError("semantic search is not configured")
    client = genai.Client(api_key=settings.gemini_api_key)
    response = await client.aio.models.embed_content(
        model=settings.gemini_embedding_model,
        contents=document,
        config=types.EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=settings.gemini_embedding_dimensions,
        ),
    )
    return _embedding_values(response)


async def queue_recipe_embedding(session: AsyncSession, recipe: Recipe) -> None:
    if not settings.semantic_search_enabled:
        return
    await session.execute(
        pg_insert(RecipeEmbedding)
        .values(
            recipe_id=recipe.id,
            model=settings.gemini_embedding_model,
            dimensions=settings.gemini_embedding_dimensions,
            document_version=settings.embedding_document_version,
            status=EmbeddingStatus.PENDING,
            source_updated_at=recipe.updated_at,
            next_attempt_at=datetime.utcnow(),
            retry_count=0,
            last_error=None,
            claimed_at=None,
        )
        .on_conflict_do_update(
            index_elements=["recipe_id"],
            set_={
                "model": settings.gemini_embedding_model,
                "dimensions": settings.gemini_embedding_dimensions,
                "document_version": settings.embedding_document_version,
                "status": EmbeddingStatus.PENDING,
                "source_updated_at": recipe.updated_at,
                "next_attempt_at": datetime.utcnow(),
                "retry_count": 0,
                "last_error": None,
                "claimed_at": None,
            },
        )
    )


async def backfill_embeddings(batch_size: int = 100) -> int:
    from sqlalchemy import or_, select
    from api.database import async_session_maker

    async with async_session_maker() as session:
        recipes = list((await session.scalars(
            select(Recipe)
            .outerjoin(RecipeEmbedding)
            .where(or_(
                RecipeEmbedding.recipe_id.is_(None),
                RecipeEmbedding.embedding.is_(None),
                RecipeEmbedding.status != EmbeddingStatus.SUCCEEDED,
                RecipeEmbedding.model != settings.gemini_embedding_model,
                RecipeEmbedding.dimensions != settings.gemini_embedding_dimensions,
                RecipeEmbedding.document_version != settings.embedding_document_version,
            ))
            .limit(batch_size)
        )).all())
        for recipe in recipes:
            await queue_recipe_embedding(session, recipe)
        await session.commit()
    log.info("embedding_backfill_queued count=%d", len(recipes))
    return len(recipes)


__all__ = [
    "EmbeddingStatus",
    "_vector_literal",
    "backfill_embeddings",
    "build_embedding_document",
    "embedding_document_hash",
    "generate_embedding",
    "queue_recipe_embedding",
]
