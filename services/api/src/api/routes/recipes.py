from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import Recipe, RecipeOut, RecipeSaveRequest
from api.users import User, current_active_user

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.post("", response_model=RecipeOut, status_code=201)
async def save_recipe(
    body: RecipeSaveRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> RecipeOut:
    recipe = Recipe(
        user_id=user.id,
        title=body.title,
        servings=body.servings,
        kcal_per_serving=body.kcal_per_serving,
        thumbnail_url=body.thumbnail_url,
        creator_handle=body.creator_handle,
        components=[c.model_dump() for c in body.components],
    )
    session.add(recipe)
    await session.commit()
    await session.refresh(recipe)
    return RecipeOut.model_validate(recipe)


@router.get("", response_model=list[RecipeOut])
async def list_recipes(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[RecipeOut]:
    result = await session.execute(
        select(Recipe).where(Recipe.user_id == user.id).order_by(Recipe.created_at.desc())
    )
    return [RecipeOut.model_validate(r) for r in result.scalars().all()]
