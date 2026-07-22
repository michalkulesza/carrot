from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from datetime import datetime, timedelta

import httpx
from sqlalchemy import func, select, text, update

from api.config import settings
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
    RecipeEmbedding,
    EmbeddingStatus,
    RecipeComponent,
    Tag,
    UserPreferences,
)
from api.routes.imports import _event_for_job
from api.routes.tags import _tag_filter
from api.services import apns as apns_svc
from api.services.embeddings import queue_recipe_embedding
from api.services.embeddings import _vector_literal, build_embedding_document, embedding_document_hash, generate_embedding
from api.services.monitoring import report_recipe_import_failure
from api.services.pipeline import run_image_import_stream, run_import_stream, run_text_import_stream

log = logging.getLogger(__name__)
_POLL_INTERVAL_SECONDS = 2
_MAX_IMPORT_RETRIES = 3
_IMPORT_RETRY_DELAY_SECONDS = 30


class ImportPipelineFailure(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _normalize_ingredient_punctuation(value: str) -> str:
    normalized = ""
    index = 0

    while index < len(value):
        if value.startswith("(,", index):
            depth = 1
            content_start = index + 2
            cursor = content_start

            while cursor < len(value) and depth > 0:
                if value[cursor] == "(":
                    depth += 1
                elif value[cursor] == ")":
                    depth -= 1
                cursor += 1

            if depth == 0:
                content = value[content_start:cursor - 1].strip()
                normalized = normalized.rstrip() + f", {content}"
                index = cursor
                continue

        normalized += value[index]
        index += 1

    return normalized


async def _get_tags_and_allergens(session, user_id: uuid.UUID, household_id: uuid.UUID | None):
    tags = list((await session.scalars(select(Tag).where(_tag_filter(user_id, household_id)))).all())
    allergens: list[str] = []
    if household_id:
        household = await session.get(Household, household_id)
        allergens = list(household.allergens) if household and household.allergens else []
    else:
        preferences = await session.get(UserPreferences, user_id)
        allergens = list(preferences.personal_allergens) if preferences and preferences.personal_allergens else []
    return [tag.name for tag in tags], allergens


def _flatten_ingredient(ingredient: Ingredient, auto_substitute: bool) -> str:
    name = ingredient.substitute if auto_substitute and ingredient.allergen and ingredient.substitute else ingredient.name
    value = " ".join(part for part in (ingredient.qty, ingredient.unit.value if ingredient.unit else None, name) if part)
    return _normalize_ingredient_punctuation(value)


def _step_ingredient_refs(component: RecipeComponent) -> list[list[dict]] | None:
    if not component.step_refs:
        return None
    refs: list[list[dict]] = [[] for _ in component.steps]
    for ref in component.step_refs:
        if ref.step_index < len(refs) - 1:
            serialized_ref = {
                "ingredient_index": ref.ingredient_index,
                "mention": ref.mention,
            }
            if ref.display:
                serialized_ref["display"] = ref.display
            refs[ref.step_index].append(serialized_ref)
    return refs


async def _save_recipe(session, job: ImportJob, result: ImportResult) -> Recipe:
    recipe_data = result.recipe
    if recipe_data is None:
        raise ValueError("no recipe to save")
    tags: list[Tag] = []
    if recipe_data.tags:
        tags = list((await session.scalars(
            select(Tag).where(_tag_filter(job.user_id, job.household_id), func.lower(Tag.name).in_([name.lower() for name in recipe_data.tags]))
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
            "shopping_list_ingredients": [
                _normalize_ingredient_punctuation(ingredient.shopping_list_value or display)
                for ingredient, display in zip(component.ingredients, flattened)
            ],
            "steps": component.steps,
            "metric_ingredients": [
                _normalize_ingredient_punctuation(value)
                for value in component.metric_ingredients or flattened
            ],
            "imperial_ingredients": [
                _normalize_ingredient_punctuation(value)
                for value in component.imperial_ingredients or flattened
            ],
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
    )
    session.add(recipe)
    await session.flush()
    await queue_recipe_embedding(session, recipe)
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
        raise ImportPipelineFailure(result.error if result else "extraction_failed")
    return result


def _is_transient(error: Exception) -> bool:
    if isinstance(error, (httpx.NetworkError, httpx.TimeoutException, TimeoutError, ConnectionError)):
        return True
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code in (500, 503)
    message = str(error).lower()
    return "429" in message or "500" in message or "503" in message or "rate limit" in message or "timeout" in message


async def _fail_or_retry(job_id: uuid.UUID, error: Exception) -> None:
    now = datetime.utcnow()
    async with async_session_maker() as session:
        job = await session.scalar(select(ImportJob).where(ImportJob.id == job_id).with_for_update())
        if job is None or job.status == ImportJobStatus.CANCELLED:
            return
        if _is_transient(error) and job.retry_count < _MAX_IMPORT_RETRIES:
            job.status = ImportJobStatus.PENDING
            job.retry_count += 1
            job.next_attempt_at = now + timedelta(seconds=_IMPORT_RETRY_DELAY_SECONDS)
            job.diagnostic_error = str(error)[:500]
            job.updated_at = now
            await _event_for_job(session, job, "import_job.retry_scheduled")
        else:
            job.status = ImportJobStatus.FAILED
            if isinstance(error, ImportPipelineFailure) and error.code == ImportFailureCode.USER_ACTION_REQUIRED.value:
                job.failure_code = ImportFailureCode.USER_ACTION_REQUIRED
            else:
                job.failure_code = ImportFailureCode.RETRIES_EXHAUSTED if _is_transient(error) else ImportFailureCode.EXTRACTION_FAILED
            job.diagnostic_error = str(error)[:500]
            job.next_attempt_at = None
            job.updated_at = now
            await _event_for_job(session, job, "import_job.failed")
            report_recipe_import_failure(
                input_kind=job.kind,
                source_url=job.input.get("url") if job.kind == ImportJobKind.URL else None,
                reason=job.failure_code,
                error=error,
            )
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
        stale_embeddings = list((await session.scalars(
            select(RecipeEmbedding)
            .where(RecipeEmbedding.status == EmbeddingStatus.RUNNING)
            .with_for_update(skip_locked=True)
        )).all())
        for embedding in stale_embeddings:
            embedding.status = EmbeddingStatus.PENDING
            embedding.next_attempt_at = datetime.utcnow()
            embedding.claimed_at = None
        await session.commit()


async def _claim_embedding_job() -> uuid.UUID | None:
    now = datetime.utcnow()
    async with async_session_maker() as session:
        job = await session.scalar(
            select(RecipeEmbedding)
            .where(
                RecipeEmbedding.status == EmbeddingStatus.PENDING,
                RecipeEmbedding.next_attempt_at <= now,
            )
            .order_by(RecipeEmbedding.next_attempt_at, RecipeEmbedding.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if job is None:
            return None
        job.status = EmbeddingStatus.RUNNING
        job.claimed_at = now
        await session.commit()
        log.info("embedding_job_claimed recipe_id=%s", job.recipe_id)
        return job.recipe_id


async def _retry_embedding_job(recipe_id: uuid.UUID, error: Exception) -> None:
    now = datetime.utcnow()
    async with async_session_maker() as session:
        job = await session.scalar(select(RecipeEmbedding).where(RecipeEmbedding.recipe_id == recipe_id).with_for_update())
        if job is None:
            return
        job.retry_count += 1
        job.last_error = type(error).__name__[:500]
        job.claimed_at = None
        message = str(error).lower()
        retryable = any(value in message for value in ("429", "503", "timeout", "unavailable", "connection"))
        if not retryable or job.retry_count >= settings.embedding_retry_cap:
            job.status = EmbeddingStatus.FAILED
            job.next_attempt_at = None
            log.warning("embedding_job_terminal_failure recipe_id=%s retries=%d", recipe_id, job.retry_count)
        else:
            job.status = EmbeddingStatus.PENDING
            delay = settings.embedding_retry_base_seconds * (2 ** min(job.retry_count - 1, 6))
            job.next_attempt_at = now + timedelta(seconds=delay)
            log.warning("embedding_job_retry recipe_id=%s retries=%d", recipe_id, job.retry_count)
        await session.commit()


async def _process_embedding_job(recipe_id: uuid.UUID) -> None:
    try:
        async with async_session_maker() as session:
            recipe = await session.scalar(select(Recipe).where(Recipe.id == recipe_id))
            if recipe is None:
                return
            document = build_embedding_document(recipe)
            document_hash = embedding_document_hash(document)
        vector = await generate_embedding(document, "RETRIEVAL_DOCUMENT")
        async with async_session_maker() as session:
            job = await session.scalar(select(RecipeEmbedding).where(RecipeEmbedding.recipe_id == recipe_id).with_for_update())
            recipe = await session.scalar(select(Recipe).where(Recipe.id == recipe_id))
            if job is None or recipe is None or job.status != EmbeddingStatus.RUNNING:
                return
            current_hash = embedding_document_hash(build_embedding_document(recipe))
            if current_hash != document_hash:
                job.status = EmbeddingStatus.PENDING
                job.next_attempt_at = datetime.utcnow()
                job.claimed_at = None
                await session.commit()
                return
            await session.execute(
                update(RecipeEmbedding)
                .where(RecipeEmbedding.recipe_id == recipe_id)
                .values(
                    embedding=text("CAST(:embedding AS vector)"),
                    model=settings.gemini_embedding_model,
                    dimensions=settings.gemini_embedding_dimensions,
                    document_version=settings.embedding_document_version,
                    document_hash=document_hash,
                    source_updated_at=recipe.updated_at,
                    status=EmbeddingStatus.SUCCEEDED,
                    retry_count=0,
                    next_attempt_at=None,
                    last_error=None,
                    claimed_at=None,
                ),
                {"embedding": _vector_literal(vector)},
            )
            await session.commit()
            log.info("embedding_job_completed recipe_id=%s dimensions=%d", recipe_id, len(vector))
    except Exception as error:
        await _retry_embedding_job(recipe_id, error)


async def _embedding_worker_loop() -> None:
    while True:
        recipe_id = await _claim_embedding_job()
        if recipe_id is None:
            await asyncio.sleep(_POLL_INTERVAL_SECONDS)
            continue
        await _process_embedding_job(recipe_id)


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
                requires_user_action = event.payload.get("failure_code") == ImportFailureCode.USER_ACTION_REQUIRED
                await apns_svc.send_alert(
                    subscription.token,
                    title="Recipe added" if success else "Recipe needs your input" if requires_user_action else "Couldn't add recipe",
                    body="Tap to view your new recipe." if success else "Open the import to continue manually." if requires_user_action else "Tap to see the failed import.",
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
    await asyncio.gather(
        *(_worker_loop() for _ in range(3)),
        *(_embedding_worker_loop() for _ in range(settings.embedding_worker_batch_size)),
        _push_loop(),
    )
