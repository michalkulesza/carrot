import copy
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import (
    PublicRecipeOut,
    PublicTagOut,
    Recipe,
    RecipeOut,
    RecipePublicShare,
    RecipePublicShareLibraryAddition,
    Tag,
)
from api.routes.recipes import _build_recipe_out
from api.services.embeddings import queue_recipe_embedding
from api.users import User, current_active_user

router = APIRouter(prefix="/public/recipes", tags=["public recipes"])


def _unavailable() -> HTTPException:
    return HTTPException(status_code=404, detail="Recipe unavailable")


async def _active_share(session: AsyncSession, token: str, lock: bool = False) -> tuple[RecipePublicShare, Recipe]:
    statement = select(RecipePublicShare, Recipe).join(Recipe, Recipe.id == RecipePublicShare.recipe_id).where(
        RecipePublicShare.token == token,
        RecipePublicShare.expires_at > datetime.utcnow(),
    )
    if lock:
        statement = statement.with_for_update()
    result = await session.execute(statement)
    row = result.one_or_none()
    if row is None:
        raise _unavailable()
    return row


@router.get("/{token}", response_model=PublicRecipeOut)
async def get_public_recipe(token: str, session: AsyncSession = Depends(get_async_session)) -> PublicRecipeOut:
    _, recipe = await _active_share(session, token)
    public_tags = [PublicTagOut(name=tag.name, category=tag.category) for tag in recipe.tags]
    return PublicRecipeOut(
        title=recipe.title, servings=recipe.servings, total_time_minutes=recipe.total_time_minutes,
        kcal_per_serving=recipe.kcal_per_serving, thumbnail_url=recipe.thumbnail_url,
        source_url=recipe.source_url, components=recipe.components, tags=public_tags,
    )


@router.post("/{token}/add-to-library", response_model=RecipeOut)
async def add_public_recipe_to_library(
    token: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> RecipeOut:
    share, source = await _active_share(session, token, lock=True)
    addition = await session.scalar(select(RecipePublicShareLibraryAddition).where(
        RecipePublicShareLibraryAddition.public_share_id == share.id,
        RecipePublicShareLibraryAddition.user_id == user.id,
    ))
    if addition is not None:
        recipe = await session.get(Recipe, addition.recipe_id)
        if recipe is not None:
            return _build_recipe_out(recipe, user.id)

    recipe = Recipe(
        user_id=user.id, household_id=None, shared_to_personal=True, title=source.title,
        servings=source.servings, total_time_minutes=source.total_time_minutes,
        kcal_per_serving=source.kcal_per_serving, protein_per_serving=source.protein_per_serving,
        fat_per_serving=source.fat_per_serving, carbs_per_serving=source.carbs_per_serving,
        thumbnail_url=source.thumbnail_url, creator_handle=None, source_url=source.source_url,
        notes=None, components=copy.deepcopy(source.components),
    )
    recipe.tags = [tag for tag in source.tags if tag.is_default]
    session.add(recipe)
    await session.flush()
    session.add(RecipePublicShareLibraryAddition(public_share_id=share.id, user_id=user.id, recipe_id=recipe.id))
    await queue_recipe_embedding(session, recipe)
    await session.commit()
    await session.refresh(recipe)
    return _build_recipe_out(recipe, user.id)
