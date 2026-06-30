from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from datetime import datetime

from sqlalchemy import or_, select, update
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from api.database import async_session_maker
from api.models import (
    Household,
    ImportJob,
    ImportJobKind,
    ImportJobStatus,
    Recipe,
    Tag,
    UserPreferences,
)
from api.services import apns as apns_svc
from api.services.pipeline import (
    run_image_import_stream,
    run_import_stream,
    run_text_import_stream,
)

log = logging.getLogger(__name__)

_POLL_INTERVAL = 5.0   # seconds between polls when queue is empty
_MAX_ATTEMPTS = 80     # declare failure after this many Gemini retries


async def _get_tags_and_allergens(session, user_id: uuid.UUID):
    result = await session.execute(
        select(Tag).where(or_(Tag.is_default.is_(True), Tag.user_id == user_id))
    )
    available_tags = [t.name for t in result.scalars().all()]

    allergens: list[str] = []
    from api.users import User  # avoid circular import at module level
    user = await session.get(User, user_id)
    if user and user.active_household_id:
        household = await session.get(Household, user.active_household_id)
        if household and household.allergens:
            a = household.allergens
            allergens = list(a.get("predefined") or []) + list(a.get("custom") or [])
    else:
        prefs_result = await session.execute(
            select(UserPreferences).where(UserPreferences.user_id == user_id)
        )
        prefs = prefs_result.scalar_one_or_none()
        if prefs and prefs.personal_allergens:
            a = prefs.personal_allergens
            allergens = list(a.get("predefined") or []) + list(a.get("custom") or [])

    return available_tags, allergens


async def _save_recipe(session, user_id: uuid.UUID, result) -> Recipe:
    """Save an ImportResult's recipe to the DB and return the new Recipe."""
    from api.models import RecipeComponent as RC  # Pydantic model
    recipe_data = result.recipe
    meta = result.metadata

    components_json = []
    for c in (recipe_data.components or []):
        components_json.append({
            "role": c.role,
            "name": c.name,
            "yield_note": c.yield_note,
            "ingredients": [i.model_dump() for i in c.ingredients],
            "steps": c.steps,
            "step_refs": [r.model_dump() for r in (c.step_refs or [])],
        })

    recipe = Recipe(
        user_id=user_id,
        household_id=None,
        shared_to_personal=True,
        title=recipe_data.title or "Imported Recipe",
        servings=recipe_data.servings,
        kcal_per_serving=recipe_data.kcal_per_serving,
        thumbnail_url=meta.thumbnail_url,
        creator_handle=meta.creator_handle,
        source_url=meta.source_url,
        components=components_json,
    )
    session.add(recipe)
    await session.flush()

    # Attach Gemini-suggested tags
    if recipe_data.tags:
        tag_result = await session.execute(
            select(Tag).where(
                or_(Tag.is_default.is_(True), Tag.user_id == user_id),
                Tag.name.in_(recipe_data.tags),
            )
        )
        recipe.tags = list(tag_result.scalars().all())

    await session.commit()
    await session.refresh(recipe)
    return recipe


async def _process_job(job: ImportJob) -> None:
    async with async_session_maker() as session:
        # Mark running
        await session.execute(
            update(ImportJob)
            .where(ImportJob.id == job.id)
            .values(status=ImportJobStatus.RUNNING, attempts=job.attempts + 1, updated_at=datetime.utcnow())
        )
        await session.commit()

    try:
        async with async_session_maker() as session:
            available_tags, allergens = await _get_tags_and_allergens(session, job.user_id)

        # Run the appropriate pipeline (draining the async generator)
        result = None
        inp = job.input

        if job.kind == ImportJobKind.URL:
            async for event in run_import_stream(
                inp["url"], model=job.model,
                available_tags=available_tags, allergens=allergens or None,
            ):
                if event["type"] == "done":
                    from api.models import ImportResult
                    result = ImportResult.model_validate(event["result"])

        elif job.kind == ImportJobKind.TEXT:
            async for event in run_text_import_stream(
                inp["text"], model=job.model,
                available_tags=available_tags, allergens=allergens or None,
            ):
                if event["type"] == "done":
                    from api.models import ImportResult
                    result = ImportResult.model_validate(event["result"])

        elif job.kind == ImportJobKind.IMAGE:
            image_data = base64.b64decode(inp["image_base64"])
            async for event in run_image_import_stream(
                image_data, inp.get("mime_type", "image/jpeg"), model=job.model,
                available_tags=available_tags, allergens=allergens or None,
            ):
                if event["type"] == "done":
                    from api.models import ImportResult
                    result = ImportResult.model_validate(event["result"])

        if result is None:
            raise RuntimeError("No result received from pipeline")

        if result.recipe is None or result.stage == "failed":
            raise RuntimeError(result.error or "Extraction failed")

        # Save recipe
        async with async_session_maker() as session:
            recipe = await _save_recipe(session, job.user_id, result)
            recipe_id = recipe.id

        # Update job succeeded
        async with async_session_maker() as session:
            await session.execute(
                update(ImportJob)
                .where(ImportJob.id == job.id)
                .values(
                    status=ImportJobStatus.SUCCEEDED,
                    result_recipe_id=recipe_id,
                    updated_at=datetime.utcnow(),
                )
            )
            await session.commit()

        # Push success notification
        title = result.recipe.title or "Recipe added"
        if job.device_push_token:
            await apns_svc.send_alert(
                job.device_push_token,
                title=title,
                body="Tap to view your new recipe.",
                data={"type": "recipe_imported", "recipe_id": str(recipe_id)},
            )
        log.info("Job %s succeeded: recipe %s", job.id, recipe_id)

    except Exception as exc:
        log.warning("Job %s failed: %s", job.id, exc)
        async with async_session_maker() as session:
            await session.execute(
                update(ImportJob)
                .where(ImportJob.id == job.id)
                .values(
                    status=ImportJobStatus.FAILED,
                    error=str(exc)[:500],
                    updated_at=datetime.utcnow(),
                )
            )
            await session.commit()

        if job.device_push_token:
            await apns_svc.send_alert(
                job.device_push_token,
                title="Couldn't add recipe",
                body="Tap to retry.",
                data={"type": "recipe_failed", "job_id": str(job.id), "job_kind": job.kind, "job_input": job.input},
            )


async def _claim_job() -> ImportJob | None:
    """Claim one pending job atomically."""
    async with async_session_maker() as session:
        result = await session.execute(
            select(ImportJob)
            .where(ImportJob.status == ImportJobStatus.PENDING)
            .order_by(ImportJob.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        job = result.scalar_one_or_none()
        if job is None:
            return None
        # Detach from session so it's usable outside
        session.expunge(job)
        return job


async def _requeue_stale() -> None:
    """On startup, requeue any jobs left in running state (crash recovery)."""
    async with async_session_maker() as session:
        result = await session.execute(
            update(ImportJob)
            .where(ImportJob.status == ImportJobStatus.RUNNING)
            .values(status=ImportJobStatus.PENDING, updated_at=datetime.utcnow())
            .returning(ImportJob.id)
        )
        stale = result.scalars().all()
        await session.commit()
    if stale:
        log.info("Requeued %d stale import jobs", len(stale))


async def run() -> None:
    """Main worker loop — runs indefinitely inside the FastAPI process."""
    await _requeue_stale()
    log.info("Import worker started")
    while True:
        try:
            job = await _claim_job()
            if job is None:
                await asyncio.sleep(_POLL_INTERVAL)
                continue
            log.info("Processing import job %s (kind=%s)", job.id, job.kind)
            asyncio.create_task(_process_job(job))
        except Exception as exc:
            log.error("Worker loop error: %s", exc)
            await asyncio.sleep(_POLL_INTERVAL)
