import asyncio
import csv
import io
import json
import logging
import uuid
from datetime import datetime, timedelta
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, delete, exists, insert, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.broadcaster import broadcaster
from api.config import settings
from api.database import get_async_session
from api.models import (
    HouseholdMember,
    Recipe,
    RecipeHouseholdsRequest,
    RecipePublicShare,
    RecipePublicShareOut,
    RecipeEmbedding,
    RecipeOrderRequest,
    RecipeOut,
    RelatedRecipeRequest,
    RecipeSaveRequest,
    Tag,
    recipe_households_table,
    recipe_related_recipes_table,
    user_recipe_favourites_table,
)
from api.routes.context import get_active_household_id, get_scope_key
from api.services.embeddings import _vector_literal, generate_embedding, queue_recipe_embedding
from api.services.orphan_cleanup import delete_orphan_recipes
from api.users import User, current_active_user

router = APIRouter(prefix="/recipes", tags=["recipes"])
log = logging.getLogger(__name__)

_CSV_FIELDS = ["title", "servings", "kcal_per_serving", "thumbnail_url", "creator_handle", "components"]
_PUBLIC_SHARE_LIFETIME = timedelta(days=7)


def _recipe_filter(household_id: uuid.UUID):
    return exists(
        select(recipe_households_table.c.recipe_id).where(
            recipe_households_table.c.household_id == household_id,
            recipe_households_table.c.recipe_id == Recipe.id,
        )
    )


def _recipe_write_filter(household_id: uuid.UUID, recipe_id: uuid.UUID):
    return and_(Recipe.id == recipe_id, _recipe_filter(household_id))


def _public_share_token() -> str:
    return secrets.token_urlsafe(32)


async def _set_tags(session: AsyncSession, recipe: Recipe, tag_ids: list[uuid.UUID], household_id: uuid.UUID) -> None:
    await session.refresh(recipe, attribute_names=["tags"])
    if not tag_ids:
        recipe.tags = []
        return
    tag_filter = or_(Tag.is_default.is_(True), Tag.household_id == household_id)
    result = await session.execute(select(Tag).where(Tag.id.in_(tag_ids), tag_filter))
    recipe.tags = list(result.scalars().all())


async def _get_favourite_ids(session: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    result = await session.execute(
        select(user_recipe_favourites_table.c.recipe_id)
        .where(user_recipe_favourites_table.c.user_id == user_id)
    )
    return {row[0] for row in result}


async def _get_household_ids_map(session: AsyncSession, recipe_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[uuid.UUID]]:
    if not recipe_ids:
        return {}
    result = await session.execute(
        select(recipe_households_table.c.recipe_id, recipe_households_table.c.household_id)
        .where(recipe_households_table.c.recipe_id.in_(recipe_ids))
    )
    household_ids_map: dict[uuid.UUID, list[uuid.UUID]] = {}
    for recipe_id, household_id in result.all():
        household_ids_map.setdefault(recipe_id, []).append(household_id)
    return household_ids_map


async def _link_recipe_to_household(session: AsyncSession, recipe_id: uuid.UUID, household_id: uuid.UUID) -> None:
    await session.execute(
        pg_insert(recipe_households_table)
        .values(recipe_id=recipe_id, household_id=household_id, added_at=datetime.utcnow())
        .on_conflict_do_nothing(index_elements=["recipe_id", "household_id"])
    )


def _build_recipe_out(
    recipe: Recipe,
    favourite_ids: set[uuid.UUID] | None = None,
    household_ids: list[uuid.UUID] | None = None,
) -> RecipeOut:
    out = RecipeOut.model_validate(recipe)
    if recipe.author is not None:
        out.added_by = recipe.author.nickname or recipe.author.email
    if favourite_ids is not None:
        out.is_favourite = recipe.id in favourite_ids
    out.household_ids = household_ids or []
    return out


@router.get("/stats")
async def recipe_stats(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> dict:
    result = await session.execute(
        select(Recipe).where(_recipe_filter(household_id))
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
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> StreamingResponse:
    result = await session.execute(
        select(Recipe)
        .where(_recipe_filter(household_id))
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
    household_id: uuid.UUID = Depends(get_active_household_id),
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
            author_id=user.id,
            title=row.get("title") or "Untitled",
            servings=int(row["servings"]) if row.get("servings") else None,
            kcal_per_serving=int(row["kcal_per_serving"]) if row.get("kcal_per_serving") else None,
            thumbnail_url=row.get("thumbnail_url") or None,
            creator_handle=row.get("creator_handle") or None,
            components=components,
        )
        session.add(recipe)
        await session.flush()
        await _link_recipe_to_household(session, recipe.id, household_id)
        await queue_recipe_embedding(session, recipe)
        count += 1

    await session.commit()
    return {"imported": count}


@router.get("", response_model=list[RecipeOut])
async def list_recipes(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> list[RecipeOut]:
    result = await session.execute(
        select(Recipe)
        .where(_recipe_filter(household_id))
        .order_by(Recipe.position.asc().nullslast(), Recipe.created_at.desc())
    )
    recipes = result.scalars().all()
    favourite_ids = await _get_favourite_ids(session, user.id)
    household_ids_map = await _get_household_ids_map(session, [r.id for r in recipes])
    return [
        _build_recipe_out(r, favourite_ids, household_ids_map.get(r.id))
        for r in recipes
    ]


@router.get("/mine", response_model=list[RecipeOut])
async def list_my_recipes(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[RecipeOut]:
    result = await session.execute(
        select(Recipe)
        .where(Recipe.author_id == user.id)
        .order_by(Recipe.created_at.desc())
    )
    recipes = result.scalars().all()
    favourite_ids = await _get_favourite_ids(session, user.id)
    household_ids_map = await _get_household_ids_map(session, [r.id for r in recipes])
    return [
        _build_recipe_out(r, favourite_ids, household_ids_map.get(r.id))
        for r in recipes
    ]


@router.get("/search", response_model=list[RecipeOut])
async def search_recipes(
    q: str = Query(min_length=3, max_length=300),
    limit: int | None = Query(default=None, ge=1, le=20),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> list[RecipeOut]:
    query = q.strip()
    if len(query) < 3 or not settings.semantic_search_enabled:
        return []
    try:
        vector = await asyncio.wait_for(generate_embedding(query, "RETRIEVAL_QUERY"), timeout=8)
        vector_literal = _vector_literal(vector)
        result_limit = min(limit or settings.semantic_search_max_results, settings.semantic_search_max_results)
        distance = RecipeEmbedding.embedding.op("<=>")(text("CAST(:query_vector AS vector)"))
        similarity = 1 - distance
        recipes = list((await session.scalars(
            select(Recipe)
            .join(RecipeEmbedding, RecipeEmbedding.recipe_id == Recipe.id)
            .where(
                _recipe_filter(household_id),
                RecipeEmbedding.model == settings.gemini_embedding_model,
                RecipeEmbedding.dimensions == settings.gemini_embedding_dimensions,
                RecipeEmbedding.document_version == settings.embedding_document_version,
                RecipeEmbedding.status == "succeeded",
                similarity >= settings.semantic_search_similarity_cutoff,
            )
            .order_by(distance)
            .limit(result_limit)
            .params(query_vector=vector_literal)
        )).unique().all())
        favourite_ids = await _get_favourite_ids(session, user.id)
        household_ids_map = await _get_household_ids_map(session, [r.id for r in recipes])
        return [_build_recipe_out(recipe, favourite_ids, household_ids_map.get(recipe.id)) for recipe in recipes]
    except Exception as error:
        log.warning("semantic_search_failed query_length=%d error=%s", len(query), type(error).__name__)
        return []


# NOTE: /stream must be defined before /{recipe_id}
@router.get("/stream")
async def stream_recipes(
    request: Request,
    user: User = Depends(current_active_user),
    household_id: uuid.UUID = Depends(get_active_household_id),
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
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> RecipeOut:
    recipe = Recipe(
        author_id=user.id,
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
    await _link_recipe_to_household(session, recipe.id, household_id)
    await _set_tags(session, recipe, body.tag_ids, household_id)
    await session.flush()
    await queue_recipe_embedding(session, recipe)
    await session.commit()
    await session.refresh(recipe)

    scope = get_scope_key("recipes", user.id, household_id)
    await broadcaster.publish(scope, {"type": "recipe_changed", "id": str(recipe.id)})

    return _build_recipe_out(recipe, household_ids=[household_id])


@router.patch("/order", status_code=204)
async def reorder_recipes(
    body: RecipeOrderRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> None:
    for position, recipe_id in enumerate(body.ids):
        result = await session.execute(
            select(Recipe).where(_recipe_write_filter(household_id, recipe_id))
        )
        recipe = result.scalar_one_or_none()
        if recipe is not None:
            recipe.position = position
    await session.commit()


@router.post("/{recipe_id}/public-share", response_model=RecipePublicShareOut)
async def create_public_share(
    recipe_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> RecipePublicShareOut:
    recipe = await session.scalar(select(Recipe).where(_recipe_write_filter(household_id, recipe_id)))
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    now = datetime.utcnow()
    await session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:recipe_id))"), {"recipe_id": str(recipe_id)})
    share = await session.scalar(select(RecipePublicShare).where(RecipePublicShare.recipe_id == recipe_id).with_for_update())
    if share is None:
        token = _public_share_token()
        while await session.scalar(select(RecipePublicShare.id).where(RecipePublicShare.token == token)):
            token = _public_share_token()
        share = RecipePublicShare(recipe_id=recipe_id, token=token, created_at=now, expires_at=now + _PUBLIC_SHARE_LIFETIME)
        session.add(share)
    elif share.expires_at <= now:
        token = _public_share_token()
        while await session.scalar(select(RecipePublicShare.id).where(RecipePublicShare.token == token)):
            token = _public_share_token()
        share.token = token
        share.created_at = now
        share.expires_at = now + _PUBLIC_SHARE_LIFETIME

    await session.commit()
    return RecipePublicShareOut(url=f"{settings.public_web_url.rstrip('/')}/r/{share.token}", expires_at=share.expires_at)


@router.put("/{recipe_id}", response_model=RecipeOut)
async def update_recipe(
    recipe_id: uuid.UUID,
    body: RecipeSaveRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> RecipeOut:
    result = await session.execute(
        select(Recipe).where(_recipe_write_filter(household_id, recipe_id))
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
    await _set_tags(session, recipe, body.tag_ids, household_id)

    await session.flush()
    await queue_recipe_embedding(session, recipe)
    await session.commit()
    await session.refresh(recipe)

    if old_thumbnail_url and old_thumbnail_url != body.thumbnail_url and settings.r2_configured:
        from api.services import r2
        asyncio.create_task(asyncio.to_thread(r2.delete_image, old_thumbnail_url))

    scope = get_scope_key("recipes", user.id, household_id)
    await broadcaster.publish(scope, {"type": "recipe_changed", "id": str(recipe.id)})

    household_ids_map = await _get_household_ids_map(session, [recipe.id])
    return _build_recipe_out(recipe, household_ids=household_ids_map.get(recipe.id))


@router.post("/{recipe_id}/tags/{tag_id}", status_code=204)
async def add_tag_to_recipe(
    recipe_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> None:
    recipe_result = await session.execute(
        select(Recipe).where(_recipe_write_filter(household_id, recipe_id))
    )
    recipe = recipe_result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    tag_filter = or_(Tag.is_default.is_(True), Tag.household_id == household_id)
    tag_result = await session.execute(select(Tag).where(Tag.id == tag_id, tag_filter))
    tag = tag_result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")

    await session.refresh(recipe, attribute_names=["tags"])
    if tag not in recipe.tags:
        recipe.tags.append(tag)
        await session.flush()
        await queue_recipe_embedding(session, recipe)
        await session.commit()


@router.delete("/{recipe_id}/tags/{tag_id}", status_code=204)
async def remove_tag_from_recipe(
    recipe_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> None:
    recipe_result = await session.execute(
        select(Recipe).where(_recipe_write_filter(household_id, recipe_id))
    )
    recipe = recipe_result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    recipe.tags = [t for t in recipe.tags if t.id != tag_id]
    await session.flush()
    await queue_recipe_embedding(session, recipe)
    await session.commit()


async def _user_household_ids(session: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    result = await session.execute(
        select(HouseholdMember.household_id).where(HouseholdMember.user_id == user_id)
    )
    return {row[0] for row in result}


@router.put("/{recipe_id}/households", response_model=RecipeOut)
async def set_recipe_households(
    recipe_id: uuid.UUID,
    body: RecipeHouseholdsRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> RecipeOut:
    recipe = await session.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    member_household_ids = await _user_household_ids(session, user.id)
    is_author = recipe.author_id == user.id
    current_household_ids = await session.execute(
        select(recipe_households_table.c.household_id).where(recipe_households_table.c.recipe_id == recipe_id)
    )
    is_linked_to_own_household = bool({row[0] for row in current_household_ids} & member_household_ids)
    if not is_author and not is_linked_to_own_household:
        raise HTTPException(status_code=404, detail="Recipe not found")

    target_ids = set(body.household_ids)
    if target_ids - member_household_ids:
        raise HTTPException(status_code=403, detail="Not a member of one or more households")

    await session.execute(delete(recipe_households_table).where(recipe_households_table.c.recipe_id == recipe_id))
    for household_id in target_ids:
        await _link_recipe_to_household(session, recipe_id, household_id)

    await delete_orphan_recipes(session, [recipe_id])
    await session.commit()

    recipe = await session.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    household_ids_map = await _get_household_ids_map(session, [recipe.id])
    return _build_recipe_out(recipe, household_ids=household_ids_map.get(recipe.id))


@router.delete("/{recipe_id}/households/{household_id}", status_code=204)
async def remove_recipe_from_household(
    recipe_id: uuid.UUID,
    household_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    membership = await session.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == user.id,
        )
    )
    if membership.scalar_one_or_none() is None:
        raise HTTPException(status_code=403, detail="Not a member of this household")

    result = await session.execute(
        delete(recipe_households_table).where(
            recipe_households_table.c.recipe_id == recipe_id,
            recipe_households_table.c.household_id == household_id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Recipe not found in this household")

    await delete_orphan_recipes(session, [recipe_id])
    await session.commit()

    scope = get_scope_key("recipes", user.id, household_id)
    await broadcaster.publish(scope, {"type": "recipe_changed", "id": str(recipe_id)})


@router.get("/{recipe_id}/related", response_model=list[RecipeOut])
async def list_related_recipes(
    recipe_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> list[RecipeOut]:
    related_ids = select(recipe_related_recipes_table.c.related_recipe_id).where(
        recipe_related_recipes_table.c.recipe_id == recipe_id
    ).union(select(recipe_related_recipes_table.c.recipe_id).where(
        recipe_related_recipes_table.c.related_recipe_id == recipe_id
    ))
    recipes = list((await session.scalars(
        select(Recipe).where(_recipe_filter(household_id), Recipe.id.in_(related_ids))
    )).all())
    favourite_ids = await _get_favourite_ids(session, user.id)
    household_ids_map = await _get_household_ids_map(session, [r.id for r in recipes])
    return [_build_recipe_out(recipe, favourite_ids, household_ids_map.get(recipe.id)) for recipe in recipes]


@router.put("/{recipe_id}/related", response_model=list[RecipeOut])
async def set_related_recipes(
    recipe_id: uuid.UUID,
    body: RelatedRecipeRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> list[RecipeOut]:
    source = await session.scalar(select(Recipe).where(_recipe_write_filter(household_id, recipe_id)))
    if source is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    target_ids = set(body.recipe_ids)
    if recipe_id in target_ids:
        raise HTTPException(status_code=422, detail="recipe_cannot_relate_to_itself")
    targets = list((await session.scalars(select(Recipe).where(_recipe_filter(household_id), Recipe.id.in_(target_ids)))).all())
    if len(targets) != len(target_ids):
        raise HTTPException(status_code=404, detail="Related recipe not found")
    await session.execute(delete(recipe_related_recipes_table).where(
        (recipe_related_recipes_table.c.recipe_id == recipe_id) |
        (recipe_related_recipes_table.c.related_recipe_id == recipe_id)
    ))
    if targets:
        insert_stmt = pg_insert(recipe_related_recipes_table).on_conflict_do_nothing(
            index_elements=["recipe_id", "related_recipe_id"]
        )
        await session.execute(insert_stmt, [
            {"recipe_id": min(recipe_id, target.id), "related_recipe_id": max(recipe_id, target.id)}
            for target in targets
        ])
    await session.commit()
    scope = get_scope_key("recipes", user.id, household_id)
    await broadcaster.publish(scope, {"type": "recipe_changed", "id": str(recipe_id)})
    favourite_ids = await _get_favourite_ids(session, user.id)
    household_ids_map = await _get_household_ids_map(session, [t.id for t in targets])
    return [_build_recipe_out(recipe, favourite_ids, household_ids_map.get(recipe.id)) for recipe in targets]


@router.post("/{recipe_id}/favourite")
async def toggle_favourite(
    recipe_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> dict:
    result = await session.execute(
        select(Recipe).where(_recipe_filter(household_id), Recipe.id == recipe_id)
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
) -> None:
    recipe = await session.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if recipe.author_id != user.id:
        raise HTTPException(status_code=403, detail="Only the author can delete this recipe everywhere")

    household_ids_result = await session.execute(
        select(recipe_households_table.c.household_id).where(recipe_households_table.c.recipe_id == recipe_id)
    )
    affected_household_ids = [row[0] for row in household_ids_result]

    thumbnail_url = recipe.thumbnail_url
    await session.delete(recipe)
    await session.commit()

    for household_id in affected_household_ids:
        scope = get_scope_key("recipes", user.id, household_id)
        await broadcaster.publish(scope, {"type": "recipe_changed", "id": str(recipe_id)})

    if thumbnail_url and settings.r2_configured:
        from api.services import r2
        asyncio.create_task(asyncio.to_thread(r2.delete_image, thumbnail_url))
