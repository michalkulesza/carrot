import csv
import io
import json
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import Recipe, RecipeOut, RecipeSaveRequest, Tag
from api.routes.context import get_active_household_id
from api.users import User, current_active_user

router = APIRouter(prefix="/recipes", tags=["recipes"])

_CSV_FIELDS = ["title", "servings", "kcal_per_serving", "thumbnail_url", "creator_handle", "components"]


def _recipe_filter(user_id: uuid.UUID, household_id: uuid.UUID | None):
    if household_id is not None:
        return Recipe.household_id == household_id
    return and_(
        Recipe.user_id == user_id,
        or_(Recipe.household_id.is_(None), Recipe.shared_to_personal.is_(True)),
    )


def _recipe_write_filter(user_id: uuid.UUID, household_id: uuid.UUID | None, recipe_id: uuid.UUID):
    if household_id is not None:
        return and_(Recipe.id == recipe_id, Recipe.household_id == household_id)
    return and_(
        Recipe.id == recipe_id,
        Recipe.user_id == user_id,
        or_(Recipe.household_id.is_(None), Recipe.shared_to_personal.is_(True)),
    )


async def _set_tags(
    session: AsyncSession,
    recipe: Recipe,
    tag_ids: list[uuid.UUID],
    user_id: uuid.UUID,
    household_id: uuid.UUID | None,
) -> None:
    await session.refresh(recipe, attribute_names=["tags"])
    if not tag_ids:
        recipe.tags = []
        return
    if household_id is not None:
        tag_filter = or_(Tag.is_default.is_(True), Tag.household_id == household_id)
    else:
        tag_filter = or_(
            Tag.is_default.is_(True),
            and_(Tag.user_id == user_id, Tag.household_id.is_(None)),
        )
    result = await session.execute(
        select(Tag).where(Tag.id.in_(tag_ids), tag_filter)
    )
    recipe.tags = list(result.scalars().all())


def _build_recipe_out(recipe: Recipe) -> RecipeOut:
    out = RecipeOut.model_validate(recipe)
    if recipe.household_id is not None and recipe.author is not None:
        out.added_by = recipe.author.nickname or recipe.author.email
    return out


@router.get("/stats")
async def recipe_stats(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> dict:
    result = await session.execute(
        select(Recipe).where(_recipe_filter(user.id, household_id))
    )
    recipes = result.scalars().all()

    total = len(recipes)
    total_ingredients = sum(
        len(comp.get("ingredients", []))
        for r in recipes
        for comp in (r.components or [])
    )
    kcal_values = [r.kcal_per_serving for r in recipes if r.kcal_per_serving is not None]
    avg_kcal = round(sum(kcal_values) / len(kcal_values)) if kcal_values else None

    return {
        "total_recipes": total,
        "total_ingredients": total_ingredients,
        "avg_kcal": avg_kcal,
        "with_kcal": len(kcal_values),
    }


@router.get("/export")
async def export_recipes(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> StreamingResponse:
    result = await session.execute(
        select(Recipe)
        .where(_recipe_filter(user.id, household_id))
        .order_by(Recipe.created_at.desc())
    )
    recipes = result.scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_CSV_FIELDS)
    for r in recipes:
        writer.writerow([
            r.title,
            r.servings if r.servings is not None else "",
            r.kcal_per_serving if r.kcal_per_serving is not None else "",
            r.thumbnail_url or "",
            r.creator_handle or "",
            json.dumps(r.components),
        ])

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=recipes.csv"},
    )


@router.post("/import")
async def import_recipes(
    file: UploadFile = File(...),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> dict:
    content = await file.read()
    try:
        raw = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames or "title" not in reader.fieldnames:
        raise HTTPException(status_code=400, detail="Invalid CSV: missing required columns")

    count = 0
    for row in reader:
        try:
            components = json.loads(row.get("components") or "[]")
        except json.JSONDecodeError:
            components = []

        recipe = Recipe(
            user_id=user.id,
            household_id=household_id,
            shared_to_personal=True,
            title=row.get("title") or "Untitled",
            servings=int(row["servings"]) if row.get("servings") else None,
            kcal_per_serving=int(row["kcal_per_serving"]) if row.get("kcal_per_serving") else None,
            thumbnail_url=row.get("thumbnail_url") or None,
            creator_handle=row.get("creator_handle") or None,
            components=components,
        )
        session.add(recipe)
        count += 1

    await session.commit()
    return {"imported": count}


@router.get("", response_model=list[RecipeOut])
async def list_recipes(
    personal: bool = False,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> list[RecipeOut]:
    # personal=True forces strict personal scope (household_id IS NULL only)
    effective_hid = None if personal else household_id
    result = await session.execute(
        select(Recipe)
        .where(_recipe_filter(user.id, effective_hid) if not personal
               else and_(Recipe.user_id == user.id, Recipe.household_id.is_(None)))
        .order_by(Recipe.created_at.desc())
    )
    return [_build_recipe_out(r) for r in result.scalars().all()]


@router.post("", response_model=RecipeOut, status_code=201)
async def save_recipe(
    body: RecipeSaveRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> RecipeOut:
    recipe = Recipe(
        user_id=user.id,
        household_id=household_id,
        shared_to_personal=body.shared_to_personal if household_id is not None else True,
        title=body.title,
        servings=body.servings,
        kcal_per_serving=body.kcal_per_serving,
        thumbnail_url=body.thumbnail_url,
        creator_handle=body.creator_handle,
        source_url=body.source_url,
        components=[c.model_dump() for c in body.components],
    )
    session.add(recipe)
    await session.flush()
    await _set_tags(session, recipe, body.tag_ids, user.id, household_id)
    await session.commit()
    await session.refresh(recipe)
    return _build_recipe_out(recipe)


@router.put("/{recipe_id}", response_model=RecipeOut)
async def update_recipe(
    recipe_id: uuid.UUID,
    body: RecipeSaveRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> RecipeOut:
    result = await session.execute(
        select(Recipe).where(_recipe_write_filter(user.id, household_id, recipe_id))
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    recipe.title = body.title
    recipe.servings = body.servings
    recipe.kcal_per_serving = body.kcal_per_serving
    recipe.thumbnail_url = body.thumbnail_url
    recipe.creator_handle = body.creator_handle
    recipe.source_url = body.source_url
    recipe.components = [c.model_dump() for c in body.components]
    if household_id is not None:
        recipe.shared_to_personal = body.shared_to_personal
    await _set_tags(session, recipe, body.tag_ids, user.id, household_id)

    await session.commit()
    await session.refresh(recipe)
    return _build_recipe_out(recipe)


@router.post("/{recipe_id}/tags/{tag_id}", status_code=204)
async def add_tag_to_recipe(
    recipe_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> None:
    recipe_result = await session.execute(
        select(Recipe).where(_recipe_write_filter(user.id, household_id, recipe_id))
    )
    recipe = recipe_result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    if household_id is not None:
        tag_filter = or_(Tag.is_default.is_(True), Tag.household_id == household_id)
    else:
        tag_filter = or_(
            Tag.is_default.is_(True),
            and_(Tag.user_id == user.id, Tag.household_id.is_(None)),
        )
    tag_result = await session.execute(
        select(Tag).where(Tag.id == tag_id, tag_filter)
    )
    tag = tag_result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")

    await session.refresh(recipe, attribute_names=["tags"])
    if tag not in recipe.tags:
        recipe.tags.append(tag)
        await session.commit()


@router.delete("/{recipe_id}/tags/{tag_id}", status_code=204)
async def remove_tag_from_recipe(
    recipe_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> None:
    recipe_result = await session.execute(
        select(Recipe).where(_recipe_write_filter(user.id, household_id, recipe_id))
    )
    recipe = recipe_result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    recipe.tags = [t for t in recipe.tags if t.id != tag_id]
    await session.commit()


@router.post("/{recipe_id}/link-to-household", response_model=RecipeOut)
async def link_recipe_to_household(
    recipe_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> RecipeOut:
    if household_id is None:
        raise HTTPException(status_code=400, detail="Not in a household context")
    result = await session.execute(
        select(Recipe).where(
            Recipe.id == recipe_id,
            Recipe.user_id == user.id,
            Recipe.household_id.is_(None),
        )
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Personal recipe not found")
    recipe.household_id = household_id
    recipe.shared_to_personal = True
    await session.commit()
    await session.refresh(recipe)
    return _build_recipe_out(recipe)


@router.delete("/{recipe_id}", status_code=204)
async def delete_recipe(
    recipe_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> None:
    result = await session.execute(
        select(Recipe).where(_recipe_write_filter(user.id, household_id, recipe_id))
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    await session.delete(recipe)
    await session.commit()
