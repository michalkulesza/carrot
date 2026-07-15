import asyncio
import csv
import io
import json
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, delete, exists, insert, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.broadcaster import broadcaster
from api.config import settings
from api.database import get_async_session
from api.models import (
    HouseholdMember,
    Recipe,
    RecipeOrderRequest,
    RecipeOut,
    RecipeSaveRequest,
    Tag,
    recipe_personal_links_table,
    user_recipe_favourites_table,
)
from api.routes.context import get_active_household_id, get_scope_key
from api.users import User, current_active_user

router = APIRouter(prefix="/recipes", tags=["recipes"])

_CSV_FIELDS = ["title", "servings", "kcal_per_serving", "thumbnail_url", "creator_handle", "components"]


def _personally_linked(user_id: uuid.UUID):
    return exists(
        select(recipe_personal_links_table.c.recipe_id).where(
            recipe_personal_links_table.c.user_id == user_id,
            recipe_personal_links_table.c.recipe_id == Recipe.id,
        )
    )


def _recipe_filter(user_id: uuid.UUID, household_id: uuid.UUID | None):
    if household_id is not None:
        return Recipe.household_id == household_id
    return or_(
        and_(
            Recipe.user_id == user_id,
            or_(Recipe.household_id.is_(None), Recipe.shared_to_personal.is_(True)),
        ),
        _personally_linked(user_id),
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


async def _get_favourite_ids(session: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    result = await session.execute(
        select(user_recipe_favourites_table.c.recipe_id)
        .where(user_recipe_favourites_table.c.user_id == user_id)
    )
    return {row[0] for row in result}


async def _get_personal_link_ids(session: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    result = await session.execute(
        select(recipe_personal_links_table.c.recipe_id)
        .where(recipe_personal_links_table.c.user_id == user_id)
    )
    return {row[0] for row in result}


def _build_recipe_out(
    recipe: Recipe,
    viewer_id: uuid.UUID,
    favourite_ids: set[uuid.UUID] | None = None,
    personal_link_ids: set[uuid.UUID] | None = None,
) -> RecipeOut:
    out = RecipeOut.model_validate(recipe)
    if recipe.household_id is not None and recipe.author is not None:
        out.added_by = recipe.author.nickname or recipe.author.email
    if favourite_ids is not None:
        out.is_favourite = recipe.id in favourite_ids
    # shared_to_personal reflects whether THIS viewer already has the recipe in
    # their own personal library, not just whether the row was ever linked by anyone.
    out.shared_to_personal = (recipe.user_id == viewer_id and recipe.shared_to_personal) or (
        personal_link_ids is not None and recipe.id in personal_link_ids
    )
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
    protein_values = [r.protein_per_serving for r in recipes if r.protein_per_serving is not None]
    avg_protein = round(sum(protein_values) / len(protein_values)) if protein_values else None
    fat_values = [r.fat_per_serving for r in recipes if r.fat_per_serving is not None]
    avg_fat = round(sum(fat_values) / len(fat_values)) if fat_values else None
    carbs_values = [r.carbs_per_serving for r in recipes if r.carbs_per_serving is not None]
    avg_carbs = round(sum(carbs_values) / len(carbs_values)) if carbs_values else None

    return {
        "total_recipes": total,
        "total_ingredients": total_ingredients,
        "avg_kcal": avg_kcal,
        "with_kcal": len(kcal_values),
        "avg_protein": avg_protein,
        "with_protein": len(protein_values),
        "avg_fat": avg_fat,
        "with_fat": len(fat_values),
        "avg_carbs": avg_carbs,
        "with_carbs": len(carbs_values),
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
        .order_by(Recipe.position.asc().nullslast(), Recipe.created_at.desc())
    )
    favourite_ids = await _get_favourite_ids(session, user.id)
    personal_link_ids = await _get_personal_link_ids(session, user.id)
    return [
        _build_recipe_out(r, user.id, favourite_ids, personal_link_ids)
        for r in result.scalars().all()
    ]


# NOTE: /stream must be defined before /{recipe_id}
@router.get("/stream")
async def stream_recipes(
    request: Request,
    user: User = Depends(current_active_user),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> StreamingResponse:
    scope = get_scope_key("recipes", user.id, household_id)

    async def event_gen():
        q = await broadcaster.subscribe(scope)
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            broadcaster.unsubscribe(scope, q)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
        total_time_minutes=body.total_time_minutes,
        kcal_per_serving=body.kcal_per_serving,
        protein_per_serving=body.protein_per_serving,
        fat_per_serving=body.fat_per_serving,
        carbs_per_serving=body.carbs_per_serving,
        thumbnail_url=body.thumbnail_url,
        creator_handle=body.creator_handle,
        source_url=body.source_url,
        notes=body.notes,
        components=[c.model_dump() for c in body.components],
    )
    session.add(recipe)
    await session.flush()
    await _set_tags(session, recipe, body.tag_ids, user.id, household_id)
    await session.commit()
    await session.refresh(recipe)

    scope = get_scope_key("recipes", user.id, household_id)
    await broadcaster.publish(scope, {"type": "recipe_changed", "id": str(recipe.id)})

    return _build_recipe_out(recipe, user.id)


@router.patch("/order", status_code=204)
async def reorder_recipes(
    body: RecipeOrderRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> None:
    for position, recipe_id in enumerate(body.ids):
        result = await session.execute(
            select(Recipe).where(_recipe_write_filter(user.id, household_id, recipe_id))
        )
        recipe = result.scalar_one_or_none()
        if recipe is not None:
            recipe.position = position
    await session.commit()


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

    old_thumbnail_url = recipe.thumbnail_url

    recipe.title = body.title
    recipe.servings = body.servings
    recipe.total_time_minutes = body.total_time_minutes
    recipe.kcal_per_serving = body.kcal_per_serving
    recipe.protein_per_serving = body.protein_per_serving
    recipe.fat_per_serving = body.fat_per_serving
    recipe.carbs_per_serving = body.carbs_per_serving
    recipe.thumbnail_url = body.thumbnail_url
    recipe.creator_handle = body.creator_handle
    recipe.source_url = body.source_url
    recipe.notes = body.notes
    recipe.components = [c.model_dump() for c in body.components]
    if household_id is not None:
        recipe.shared_to_personal = body.shared_to_personal
    await _set_tags(session, recipe, body.tag_ids, user.id, household_id)

    await session.commit()
    await session.refresh(recipe)

    if old_thumbnail_url and old_thumbnail_url != body.thumbnail_url and settings.r2_configured:
        from api.services import r2
        asyncio.create_task(asyncio.to_thread(r2.delete_image, old_thumbnail_url))

    scope = get_scope_key("recipes", user.id, household_id)
    await broadcaster.publish(scope, {"type": "recipe_changed", "id": str(recipe.id)})

    personal_link_ids = await _get_personal_link_ids(session, user.id)
    return _build_recipe_out(recipe, user.id, personal_link_ids=personal_link_ids)


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
    target_household_id: uuid.UUID | None = None,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    active_household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> RecipeOut:
    household_id = target_household_id or active_household_id
    if household_id is None:
        raise HTTPException(status_code=400, detail="Not in a household context")
    if target_household_id is not None:
        membership = await session.execute(
            select(HouseholdMember).where(
                HouseholdMember.household_id == target_household_id,
                HouseholdMember.user_id == user.id,
            )
        )
        if membership.scalar_one_or_none() is None:
            raise HTTPException(status_code=403, detail="Not a member of that household")
    result = await session.execute(
        select(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == user.id)
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if recipe.household_id is not None:
        raise HTTPException(status_code=400, detail="Recipe already belongs to a household")
    recipe.household_id = household_id
    recipe.shared_to_personal = True
    await session.commit()
    await session.refresh(recipe)
    return _build_recipe_out(recipe, user.id)


@router.post("/{recipe_id}/link-to-personal", response_model=RecipeOut)
async def link_recipe_to_personal(
    recipe_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    active_household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> RecipeOut:
    if active_household_id is None:
        raise HTTPException(status_code=400, detail="Not in a household context")
    result = await session.execute(
        select(Recipe).where(
            Recipe.id == recipe_id,
            Recipe.household_id == active_household_id,
        )
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    insert_stmt = pg_insert(recipe_personal_links_table).values(
        user_id=user.id, recipe_id=recipe.id
    ).on_conflict_do_nothing(index_elements=["user_id", "recipe_id"])
    await session.execute(insert_stmt)
    await session.commit()
    await session.refresh(recipe)
    return _build_recipe_out(recipe, user.id, personal_link_ids={recipe.id})


@router.post("/{recipe_id}/favourite")
async def toggle_favourite(
    recipe_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> dict:
    result = await session.execute(
        select(Recipe).where(_recipe_filter(user.id, household_id), Recipe.id == recipe_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    existing = await session.execute(
        select(user_recipe_favourites_table).where(
            and_(
                user_recipe_favourites_table.c.user_id == user.id,
                user_recipe_favourites_table.c.recipe_id == recipe_id,
            )
        )
    )
    if existing.one_or_none() is not None:
        await session.execute(
            delete(user_recipe_favourites_table).where(
                and_(
                    user_recipe_favourites_table.c.user_id == user.id,
                    user_recipe_favourites_table.c.recipe_id == recipe_id,
                )
            )
        )
        is_favourite = False
    else:
        await session.execute(
            insert(user_recipe_favourites_table).values(user_id=user.id, recipe_id=recipe_id)
        )
        is_favourite = True

    await session.commit()
    return {"is_favourite": is_favourite}


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
    thumbnail_url = recipe.thumbnail_url
    await session.delete(recipe)
    await session.commit()

    if thumbnail_url and settings.r2_configured:
        from api.services import r2
        asyncio.create_task(asyncio.to_thread(r2.delete_image, thumbnail_url))
