from __future__ import annotations

import asyncio
import base64
import logging
import random
import uuid
from datetime import datetime, timedelta

import httpx
from sqlalchemy import func, select, update

from api.database import async_session_maker
from api.models import (
    DeviceSubscription,
    Household,
    HouseholdMember,
    ImportFailureCode,
    ImportJob,
    ImportJobEvent,
    ImportJobKind,
    ImportJobStatus,
    ImportResult,
    Ingredient,
    Recipe,
    RecipeComponent,
    Tag,
    UserPreferences,
)
from api.routes.imports import _event_for_job
from api.routes.tags import _tag_filter
from api.services import apns as apns_svc
from api.services.pipeline import run_image_import_stream, run_import_stream, run_text_import_stream

log = logging.getLogger(__name__)
_POLL_INTERVAL_SECONDS = 2
_MAX_RETRY_WINDOW = timedelta(minutes=30)


async def _get_tags_and_allergens(session, user_id: uuid.UUID, household_id: uuid.UUID | None):
    tags = list((await session.scalars(select(Tag).where(_tag_filter(user_id, household_id)))).all())
    allergens: list[str] = []
    if household_id:
        household = await session.get(Household, household_id)
        if household and household.allergens:
            allergens = list(household.allergens.get("predefined") or []) + list(household.allergens.get("custom") or [])
    else:
        prefs = await session.get(UserPreferences, user_id)
        if prefs and prefs.personal_allergens:
            allergens = list(prefs.personal_allergens.get("predefined") or []) + list(prefs.personal_allergens.get("custom") or [])
    return [tag.name for tag in tags], allergens


def _flatten_ingredient(ingredient: Ingredient, auto_substitute: bool) -> str:
    name = ingredient.substitute if auto_substitute and ingredient.allergen and ingredient.substitute else ingredient.name
    return " ".join(part for part in (ingredient.qty, ingredient.unit.value if ingredient.unit else None, name) if part)


def _step_ingredient_refs(component: RecipeComponent) -> list[list[dict]] | None:
    if not component.step_refs:
        return None
    refs: list[list[dict]] = [[] for _ in component.steps]
    for ref in component.step_refs:
        if ref.step_index < len(refs) - 1:
            refs[ref.step_index].append({"ingredient_index": ref.ingredient_index, "mention": ref.mention})
    return refs


async def _save_recipe(session, job: ImportJob, result: ImportResult) -> Recipe:
    recipe_data = result.recipe
    if recipe_data is None:
        raise ValueError("no recipe to save")
    tags: list[Tag] = []
    if recipe_data.tags:
        tags = list((await session.scalars(
            select(Tag).where(
                _tag_filter(job.user_id, job.household_id),
                func.lower(Tag.name).in_([name.lower() for name in recipe_data.tags]),
            )
        )).all())
    preferences = await session.get(UserPreferences, job.user_id)
    auto_substitute = bool(preferences and preferences.auto_substitute)
    components = []
    for component in recipe_data.components or []:
        flattened = [_flatten_ingredient(ingredient, auto_substitute) for ingredient in component.ingredients]
        components.append({
            "name": component.name or component.role,
            "yield_note": component.yield_note or "",
            "ingredients": flattened,
            "shopping_list_ingredients": [ingredient.shopping_list_value or display for ingredient, display in zip(component.ingredients, flattened)],
            "steps": component.steps,
            "metric_ingredients": component.metric_ingredients or flattened,
            "imperial_ingredients": component.imperial_ingredients or flattened,
            "metric_steps": component.metric_steps or component.steps,
            "imperial_steps": component.imperial_steps or component.steps,
            "ingredient_flags": [{
                "allergen": ingredient.allergen,
                "substitute": ingredient.substitute,
                "substitute_applied": bool(auto_substitute and ingredient.allergen and ingredient.substitute),
                "original_display": None,
            } for ingredient in component.ingredients],
            "step_ingredient_refs": _step_ingredient_refs(component),
        })
    metadata = result.metadata
    recipe = Recipe(
        user_id=job.user_id,
        household_id=job.household_id,
        shared_to_personal=job.shared_to_personal,
        title=recipe_data.title or "Imported Recipe",
        servings=recipe_data.servings,
        total_time_minutes=recipe_data.total_time_minutes,
        kcal_per_serving=recipe_data.kcal_per_serving,
        protein_per_serving=recipe_data.protein_per_serving,
        fat_per_serving=recipe_data.fat_per_serving,
        carbs_per_serving=recipe_data.carbs_per_serving,
        thumbnail_url=metadata.thumbnail_url,
        creator_handle=metadata.creator_handle,
        source_url=metadata.source_url,
        components=components,
        tags=tags,
        debug_model=metadata.debug.model if metadata.debug else None,
        debug_input_tokens=metadata.debug.input_tokens if metadata.debug else None,
        debug_output_tokens=metadata.debug.output_tokens if metadata.debug else None,
        debug_total_tokens=metadata.debug.total_tokens if metadata.debug else None,
    )
    session.add(recipe)
    await session.flush()
    return recipe


async def _claim_job() -> uuid.UUID | None:
    now = datetime.utcnow()
    async with async_session_maker() as session:
        job = await session.scalar(
            select(ImportJob)
            .where(ImportJob.status == ImportJobStatus.PENDING, ImportJob.next_attempt_at <= now)
            .order_by(ImportJob.next_attempt_at, ImportJob.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if job is None:
            return None
        job.status = ImportJobStatus.RUNNING
        job.started_at = job.started_at or now
        job.updated_at = now
        await _event_for_job(session, job, "import_job.running")
        await session.commit()
        return job.id


async def _is_member(session, job: ImportJob) -> bool:
    if job.household_id is None:
        return True
    return await session.get(HouseholdMember, {"household_id": job.household_id, "user_id": job.user_id}) is not None


async def _run_pipeline(job: ImportJob, available_tags: list[str], allergens: list[str]) -> ImportResult:
    result: ImportResult | None = None
    if job.kind == ImportJobKind.URL:
        generator = run_import_stream(job.input["url"], model=job.model, available_tags=available_tags, allergens=allergens or None)
    elif job.kind == ImportJobKind.TEXT:
        generator = run_text_import_stream(job.input["text"], model=job.model, available_tags=available_tags, allergens=allergens or None)
    else:
        image_data = base64.b64decode(job.input["image_base64"])
        generator = run_image_import_stream(image_data, job.input.get("mime_type", "image/jpeg"), model=job.model, available_tags=available_tags, allergens=allergens or None)
    async for event in generator:
        if event["type"] == "done":
            result = ImportResult.model_validate(event["result"])
    if result is None or result.recipe is None or result.stage == "failed":
        raise ValueError("extraction_failed")
    return result


def _is_transient(error: Exception) -> bool:
    if isinstance(error, (httpx.NetworkError, httpx.TimeoutException, TimeoutError, ConnectionError)):
        return True
    message = str(error).lower()
    return "429" in message or "503" in message or "rate limit" in message or "timeout" in message


async def _fail_or_retry(job_id: uuid.UUID, error: Exception) -> None:
    now = datetime.utcnow()
    async with async_session_maker() as session:
        job = await session.scalar(select(ImportJob).where(ImportJob.id == job_id).with_for_update())
        if job is None or job.status == ImportJobStatus.CANCELLED:
            return
        retry_deadline = (job.started_at or now) + _MAX_RETRY_WINDOW
        if _is_transient(error) and now < retry_deadline:
            job.status = ImportJobStatus.PENDING
            job.retry_count += 1
            delay = min(60, 2 ** min(job.retry_count, 6)) + random.uniform(0, 1)
            job.next_attempt_at = now + timedelta(seconds=delay)
            job.diagnostic_error = str(error)[:500]
            job.updated_at = now
            await _event_for_job(session, job, "import_job.retry_scheduled")
        else:
            job.status = ImportJobStatus.FAILED
            job.failure_code = ImportFailureCode.RETRIES_EXHAUSTED if _is_transient(error) else ImportFailureCode.EXTRACTION_FAILED
            job.diagnostic_error = str(error)[:500]
            job.next_attempt_at = None
            job.updated_at = now
            await _event_for_job(session, job, "import_job.failed")
        await session.commit()


async def _process_job(job_id: uuid.UUID) -> None:
    try:
        async with async_session_maker() as session:
            job = await session.get(ImportJob, job_id)
            if job is None or job.status != ImportJobStatus.RUNNING:
                return
            if not await _is_member(session, job):
                job.status = ImportJobStatus.FAILED
                job.failure_code = ImportFailureCode.HOUSEHOLD_ACCESS_CHANGED
                job.next_attempt_at = None
                await _event_for_job(session, job, "import_job.failed")
                await session.commit()
                return
            available_tags, allergens = await _get_tags_and_allergens(session, job.user_id, job.household_id)
            session.expunge(job)
        result = await _run_pipeline(job, available_tags, allergens)
        async with async_session_maker() as session:
            current = await session.scalar(select(ImportJob).where(ImportJob.id == job_id).with_for_update())
            if current is None or current.status == ImportJobStatus.CANCELLED:
                return
            if not await _is_member(session, current):
                current.status = ImportJobStatus.FAILED
                current.failure_code = ImportFailureCode.HOUSEHOLD_ACCESS_CHANGED
                current.next_attempt_at = None
                await _event_for_job(session, current, "import_job.failed")
                await session.commit()
                return
            recipe = await _save_recipe(session, current, result)
            current.status = ImportJobStatus.SUCCEEDED
            current.result_recipe_id = recipe.id
            current.input = {}
            current.next_attempt_at = None
            current.updated_at = datetime.utcnow()
            await _event_for_job(session, current, "import_job.succeeded")
            await session.commit()
    except Exception as error:
        log.warning("Import job %s failed: %s", job_id, error)
        await _fail_or_retry(job_id, error)


async def _requeue_stale() -> None:
    async with async_session_maker() as session:
        stale = list((await session.scalars(
            select(ImportJob).where(ImportJob.status == ImportJobStatus.RUNNING).with_for_update(skip_locked=True)
        )).all())
        for job in stale:
            job.status = ImportJobStatus.PENDING
            job.next_attempt_at = datetime.utcnow()
            job.updated_at = datetime.utcnow()
            await _event_for_job(session, job, "import_job.retry_scheduled")
        await session.commit()


async def _deliver_pushes() -> None:
    async with async_session_maker() as session:
        events = list((await session.scalars(
            select(ImportJobEvent)
            .where(
                ImportJobEvent.type.in_(("import_job.succeeded", "import_job.failed")),
                ImportJobEvent.push_dispatched_at.is_(None),
            )
            .with_for_update(skip_locked=True)
            .limit(20)
        )).all())
        for event in events:
            subscriptions = list((await session.scalars(select(DeviceSubscription).where(DeviceSubscription.user_id == event.user_id))).all())
            for subscription in subscriptions:
                success = event.type == "import_job.succeeded"
                await apns_svc.send_alert(
                    subscription.token,
                    title="Recipe added" if success else "Couldn't add recipe",
                    body="Tap to view your new recipe." if success else "Tap to see the failed import.",
                    data={"type": "recipe_imported" if success else "recipe_failed", "job_id": str(event.job_id), "recipe_id": event.payload.get("result_recipe_id")},
                )
            event.push_dispatched_at = datetime.utcnow()
            event.push_attempt_count += 1
        await session.commit()


async def _worker_loop() -> None:
    while True:
        job_id = await _claim_job()
        if job_id is None:
            await asyncio.sleep(_POLL_INTERVAL_SECONDS)
            continue
        await _process_job(job_id)


async def _push_loop() -> None:
    while True:
        try:
            await _deliver_pushes()
        except Exception as error:
            log.warning("Import push relay failed: %s", error)
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)


async def run() -> None:
    await _requeue_stale()
    await asyncio.gather(*(_worker_loop() for _ in range(3)), _push_loop())
