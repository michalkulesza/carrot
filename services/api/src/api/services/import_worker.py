from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from datetime import datetime, timedelta

import httpx
from pydantic import ValidationError
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
    ImportMetadata,
    ImportResult,
    Recipe,
    RecipeSourceEvidence,
    RecipeEmbedding,
    EmbeddingStatus,
    Tag,
    UserPreferences,
    recipe_households_table,
)
from api.routes.imports import _event_for_job
from api.routes.recipes import _link_recipe_to_household
from api.routes.tags import _tag_filter
from api.services import apns as apns_svc
from api.services import r2 as r2_svc
from api.services.embeddings import queue_recipe_embedding
from api.services.allergen_rechecks import recover_running_jobs, worker_loop as allergen_recheck_worker_loop
from api.services.embeddings import _vector_literal, build_embedding_document, embedding_document_hash, generate_embedding
from api.services.monitoring import report_recipe_import_failure, report_missing_critical_fields, report_service_failure
from api.services.extraction_v2.contracts import FailedOutcome, FailureReason
from api.services.extraction_v2.production import (
    acquire_and_extract_url, extract_captured_html, extract_image_transcript, extract_pasted_text,
)
from api.services.linked_recipes import (
    attach_child_to_parent,
    existing_linked_ids,
    NON_RECIPE_FAILURE_CODES,
    finalize_overdue_parents,
    mark_link_external,
    with_link_kinds,
    finalize_parent_of_child,
    set_linked_recipe_ids,
    spawn_linked_imports,
)
from api.services.recipe_components import serialize_components
from api.services.recipe_reextraction import apply_extraction
from api.services import gemini as gemini_svc

log = logging.getLogger(__name__)
_POLL_INTERVAL_SECONDS = 2
_MAX_IMPORT_RETRIES = 3
_IMPORT_RETRY_DELAY_SECONDS = 30
_AWAITING_CHILDREN_SWEEP_SECONDS = 60
_MAX_IMAGE_BYTES = 8 * 1024 * 1024
_MAX_TRANSCRIPT_CHARS = 20_000
_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


class ImportPipelineFailure(Exception):
    def __init__(self, code: str, stage: str = "unknown") -> None:
        super().__init__(code)
        self.code = code
        self.stage = stage


async def _enrich_v2(extracted, tags: list[str], allergens: list[str], usage: gemini_svc.UsageTracker):
    try:
        return await gemini_svc.enrich_v2_recipe(extracted, tags, allergens or None, usage)
    except TimeoutError:
        raise ImportPipelineFailure(FailureReason.MODEL_TIMEOUT.value.lower(), "enrichment") from None
    except ValidationError:
        raise ImportPipelineFailure(FailureReason.INVALID_MODEL_RESPONSE.value.lower(), "enrichment") from None
    except Exception as error:
        message = str(error).lower()
        if "429" in message or "resource_exhausted" in message or "rate limit" in message:
            reason = FailureReason.MODEL_RATE_LIMITED.value.lower()
        elif "503" in message or "unavailable" in message or "timeout" in message:
            reason = FailureReason.UNKNOWN_ERROR.value.lower()
        else:
            reason = FailureReason.INVALID_MODEL_RESPONSE.value.lower()
        raise ImportPipelineFailure(reason, "enrichment") from None


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


async def _get_tags_and_allergens(
    session,
    user_id: uuid.UUID | None,
    household_id: uuid.UUID | None,
):
    tags = []
    household = None
    if household_id is not None:
        tags = list((await session.scalars(select(Tag).where(_tag_filter(household_id)))).all())
        household = await session.get(Household, household_id)

    household_allergens = set(household.allergens) if household and household.allergens else set()
    preferences = await session.get(UserPreferences, user_id) if user_id is not None else None
    personal_allergens = set(preferences.personal_allergens) if preferences and preferences.personal_allergens else set()
    allergens = list(household_allergens | personal_allergens)
    return [tag.name for tag in tags], allergens


async def _archive_thumbnail(recipe: Recipe) -> None:
    thumbnail_url = recipe.thumbnail_url
    is_r2_url = bool(
        settings.r2_public_url
        and thumbnail_url
        and thumbnail_url.startswith(settings.r2_public_url)
    )
    if not thumbnail_url or not settings.r2_configured or is_r2_url:
        return

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            response = await client.get(thumbnail_url, headers={"User-Agent": "Mozilla/5.0"})
            response.raise_for_status()

        archived_url = await asyncio.to_thread(r2_svc.upload_image, response.content, str(recipe.id))
        recipe.thumbnail_url = archived_url
    except Exception as error:
        log.warning("Thumbnail R2 upload failed for recipe %s: %s", recipe.id, type(error).__name__)
        report_service_failure("thumbnail_archive", error=error)


async def _save_recipe(session, job: ImportJob, result: ImportResult) -> Recipe:
    recipe_data = result.recipe
    if recipe_data is None:
        raise ValueError("no recipe to save")
    tags: list[Tag] = []
    if recipe_data.tags:
        tags = list((await session.scalars(
            select(Tag).where(_tag_filter(job.household_id), func.lower(Tag.name).in_([name.lower() for name in recipe_data.tags]))
        )).all())
    preferences = await session.get(UserPreferences, job.user_id)
    auto_substitute = bool(preferences and preferences.auto_substitute)
    metadata = result.metadata
    components = with_link_kinds(serialize_components(recipe_data, auto_substitute), metadata.source_url)
    for component in components:
        for field in ("ingredients", "shopping_list_ingredients", "metric_ingredients", "imperial_ingredients"):
            component[field] = [_normalize_ingredient_punctuation(value) for value in component[field]]
    recipe = Recipe(
        author_id=job.user_id,
        title=recipe_data.title or "Imported Recipe",
        source_title=recipe_data.source_title or recipe_data.title,
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
        issue_codes=result.issue_codes,
        nutrition_provenance=recipe_data.nutrition_provenance,
        nutrition_status=recipe_data.nutrition_status,
        total_time_provenance=recipe_data.total_time_provenance,
        allergen_status=recipe_data.allergen_status,
        overview=recipe_data.overview,
        title_evidence=recipe_data.title_evidence,
        tags=tags,
    )
    session.add(recipe)
    await session.flush()
    if result.evidence:
        session.add(RecipeSourceEvidence(
            recipe_id=recipe.id, schema_version=1,
            evidence=result.evidence[:12], trace=result.trace[:200], capture=result.source_capture,
        ))
    await _archive_thumbnail(recipe)
    await _link_recipe_to_household(session, recipe.id, job.household_id)
    await queue_recipe_embedding(session, recipe)
    return recipe


async def _replace_recipe(session, job: ImportJob, result: ImportResult) -> Recipe | None:
    try:
        recipe_id = uuid.UUID(str(job.input.get("replaces_recipe_id")))
    except ValueError:
        return None
    in_household = await session.scalar(
        select(recipe_households_table.c.recipe_id).where(
            recipe_households_table.c.recipe_id == recipe_id,
            recipe_households_table.c.household_id == job.household_id,
        )
    )
    recipe = await session.get(Recipe, recipe_id, with_for_update=True) if in_household else None
    if recipe is None:
        return None
    preferences = await session.get(UserPreferences, job.user_id)
    previous_links = existing_linked_ids(recipe.components or [])
    apply_extraction(recipe, result, bool(preferences and preferences.auto_substitute))
    recipe.components, _ = set_linked_recipe_ids(recipe.components, previous_links)
    await session.merge(RecipeSourceEvidence(
        recipe_id=recipe.id, schema_version=1, evidence=result.evidence[:12],
        trace=result.trace[:200], capture=result.source_capture,
    ))
    await _archive_thumbnail(recipe)
    await queue_recipe_embedding(session, recipe)
    return recipe


def _without_captured_html(job_input: dict) -> dict:
    return {key: value for key, value in job_input.items() if key not in ("captured_html", "captured_final_url")}


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
    return await session.get(HouseholdMember, {"household_id": job.household_id, "user_id": job.user_id}) is not None


async def _run_pipeline(job: ImportJob, available_tags: list[str], allergens: list[str]) -> ImportResult:
    if job.kind == ImportJobKind.URL:
        usage = gemini_svc.UsageTracker()
        captured_html = job.input.get("captured_html")
        if captured_html:
            final_url = job.input.get("captured_final_url") or job.input["url"]
            outcome, metadata, source_capture = await extract_captured_html(job.input["url"], final_url, captured_html, usage)
        else:
            outcome, metadata, source_capture = await acquire_and_extract_url(job.input["url"], usage)
        if isinstance(outcome, FailedOutcome):
            raise ImportPipelineFailure(outcome.reason.value.lower(), outcome.failed_stage.value)
        recipe = await _enrich_v2(outcome.recipe, available_tags, allergens, usage)
        return ImportResult(
            stage="transcript", recipe=recipe, metadata=metadata,
            outcome=outcome.outcome, issue_codes=[code.value for code in outcome.issue_codes],
            evidence=[item.model_dump(mode="json") for item in outcome.evidence],
            trace=[item.model_dump(mode="json") for item in outcome.trace],
            source_capture=source_capture,
        )
    elif job.kind == ImportJobKind.TEXT:
        usage = gemini_svc.UsageTracker()
        outcome = await extract_pasted_text(job.input["text"], usage)
        if isinstance(outcome, FailedOutcome):
            raise ImportPipelineFailure(outcome.reason.value.lower(), outcome.failed_stage.value)
        recipe = await _enrich_v2(outcome.recipe, available_tags, allergens, usage)
        return ImportResult(
            stage="transcript", recipe=recipe, metadata=ImportMetadata(),
            outcome=outcome.outcome, issue_codes=[code.value for code in outcome.issue_codes],
            evidence=[item.model_dump(mode="json") for item in outcome.evidence],
            trace=[item.model_dump(mode="json") for item in outcome.trace],
            source_capture={"schema_version": 1, "kind": "text", "text": job.input["text"][:20000]},
        )
    else:
        mime_type = job.input.get("mime_type", "image/jpeg")
        encoded = job.input.get("image_base64", "")
        if mime_type not in _IMAGE_MIME_TYPES or len(encoded) > ((_MAX_IMAGE_BYTES + 2) // 3) * 4:
            raise ImportPipelineFailure(FailureReason.INVALID_INPUT.value.lower(), "input")
        try:
            image_data = base64.b64decode(encoded, validate=True)
        except (ValueError, base64.binascii.Error):
            raise ImportPipelineFailure(FailureReason.INVALID_INPUT.value.lower(), "input") from None
        if not image_data or len(image_data) > _MAX_IMAGE_BYTES:
            raise ImportPipelineFailure(FailureReason.INVALID_INPUT.value.lower(), "input")
        usage = gemini_svc.UsageTracker()
        try:
            transcript = await gemini_svc.transcribe_image_text(image_data, mime_type, model=job.model, usage=usage)
        except TimeoutError:
            raise ImportPipelineFailure(FailureReason.MODEL_TIMEOUT.value.lower(), "transcript") from None
        except Exception as error:
            message = str(error).lower()
            reason = (FailureReason.MODEL_RATE_LIMITED if "429" in message or "resource_exhausted" in message
                      else FailureReason.TRANSCRIPTION_FAILED)
            raise ImportPipelineFailure(reason.value.lower(), "transcript") from None
        if not transcript:
            raise ImportPipelineFailure(FailureReason.UNREADABLE_CONTENT.value.lower(), "transcript")
        if len(transcript) > _MAX_TRANSCRIPT_CHARS:
            raise ImportPipelineFailure(FailureReason.INVALID_INPUT.value.lower(), "transcript")
        outcome = await extract_image_transcript(transcript, usage)
        if isinstance(outcome, FailedOutcome):
            raise ImportPipelineFailure(outcome.reason.value.lower(), outcome.failed_stage.value)
        recipe = await _enrich_v2(outcome.recipe, available_tags, allergens, usage)
        return ImportResult(
            stage="transcript", recipe=recipe, metadata=ImportMetadata(),
            outcome=outcome.outcome, issue_codes=[code.value for code in outcome.issue_codes],
            evidence=[item.model_dump(mode="json") for item in outcome.evidence],
            trace=[item.model_dump(mode="json") for item in outcome.trace],
            source_capture={
                "schema_version": 1, "kind": "image", "mime_type": mime_type,
                "image_base64": encoded, "transcript": transcript,
                "capture": {"status": "complete", "errors": []},
            },
        )


def _is_transient(error: Exception) -> bool:
    if isinstance(error, ImportPipelineFailure):
        return error.code in {
            FailureReason.SOURCE_FETCH_FAILED.value.lower(),
            FailureReason.TRANSCRIPTION_FAILED.value.lower(),
            FailureReason.MODEL_TIMEOUT.value.lower(),
            FailureReason.MODEL_RATE_LIMITED.value.lower(),
            FailureReason.UNKNOWN_ERROR.value.lower(),
        }
    if isinstance(error, (httpx.NetworkError, httpx.TimeoutException, TimeoutError, ConnectionError)):
        return True
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code in (500, 503)
    message = str(error).lower()
    return "429" in message or "500" in message or "503" in message or "rate limit" in message or "timeout" in message


def _source_host_is_html(source_url: str | None) -> bool:
    from urllib.parse import urlsplit

    host = (urlsplit(source_url or "").hostname or "").lower().removeprefix("www.")
    social_hosts = ("instagram.com", "tiktok.com", "youtube.com", "youtu.be", "facebook.com", "fb.watch")
    return not any(host == domain or host.endswith(f".{domain}") for domain in social_hosts)


def _final_source_kind(input_kind: str, source_capture: dict) -> str:
    captured_kind = source_capture.get("kind")
    if captured_kind in {"html", "social", "text", "image"}:
        return captured_kind
    return {ImportJobKind.URL: "html", ImportJobKind.TEXT: "text", ImportJobKind.IMAGE: "image"}.get(input_kind, "unknown")


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
            if isinstance(error, ImportPipelineFailure):
                job.failure_code = error.code if error.code in ImportFailureCode._value2member_map_ else ImportFailureCode.UNKNOWN_ERROR
                job.failure_stage = error.stage
                job.outcome = "failed"
            job.updated_at = now
            await _event_for_job(session, job, "import_job.retry_scheduled")
        else:
            job.status = ImportJobStatus.FAILED
            job.input = _without_captured_html(job.input)
            if isinstance(error, ImportPipelineFailure) and error.code in ImportFailureCode._value2member_map_:
                job.failure_code = error.code
                job.failure_stage = error.stage
                job.outcome = "failed"
            elif isinstance(error, ImportPipelineFailure) and error.code == ImportFailureCode.USER_ACTION_REQUIRED.value:
                job.failure_code = ImportFailureCode.USER_ACTION_REQUIRED
            else:
                job.failure_code = ImportFailureCode.RETRIES_EXHAUSTED if _is_transient(error) else ImportFailureCode.EXTRACTION_FAILED
            job.diagnostic_error = str(error)[:500] if isinstance(error, ImportPipelineFailure) else type(error).__name__
            job.next_attempt_at = None
            job.updated_at = now
            auto_spawned_child = job.parent_recipe_id is not None and not job.input.get("requested_by_user")
            if auto_spawned_child:  # the linked line just stays unresolved and can be imported on tap
                job.dismissed_at = now
            await _event_for_job(session, job, "import_job.dismissed" if auto_spawned_child else "import_job.failed")
            if job.parent_recipe_id is not None and job.failure_code in NON_RECIPE_FAILURE_CODES:
                await mark_link_external(session, job.parent_recipe_id, job.input.get("url"))
            await finalize_parent_of_child(session, job)
            report_recipe_import_failure(
                input_kind=("html" if _source_host_is_html(job.input.get("url")) else "social") if job.kind == ImportJobKind.URL else ("text" if job.kind == ImportJobKind.TEXT else "image"),
                source_url=job.input.get("url") if job.kind == ImportJobKind.URL else None,
                reason=job.failure_code,
                failure_stage=job.failure_stage,
                source_kind=("html" if _source_host_is_html(job.input.get("url")) else "social") if job.kind == ImportJobKind.URL else str(job.kind),
                error=None if isinstance(error, ImportPipelineFailure) else error,
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
                job.input = _without_captured_html(job.input)
                job.next_attempt_at = None
                await _event_for_job(session, job, "import_job.failed")
                await finalize_parent_of_child(session, job)
                await session.commit()
                return
            available_tags, allergens = await _get_tags_and_allergens(session, job.user_id, job.household_id)
            session.expunge(job)
        result = await _run_pipeline(job, available_tags, allergens)
        async with async_session_maker() as session:
            current = await session.scalar(select(ImportJob).where(ImportJob.id == job_id).with_for_update())
            if current is None or current.status == ImportJobStatus.CANCELLED:
                return
            if current.result_recipe_id is not None:
                current.status = ImportJobStatus.SUCCEEDED
                current.updated_at = datetime.utcnow()
                if current.parent_recipe_id is not None:
                    existing = await session.get(Recipe, current.result_recipe_id)
                    if existing is not None:
                        await attach_child_to_parent(session, current.parent_recipe_id, existing, current.input.get("url"))
                    await finalize_parent_of_child(session, current)
                await session.commit()
                return
            if not await _is_member(session, current):
                current.status = ImportJobStatus.FAILED
                current.failure_code = ImportFailureCode.HOUSEHOLD_ACCESS_CHANGED
                current.input = _without_captured_html(current.input)
                current.next_attempt_at = None
                await _event_for_job(session, current, "import_job.failed")
                await finalize_parent_of_child(session, current)
                await session.commit()
                return
            recipe = await _replace_recipe(session, current, result) or await _save_recipe(session, current, result)
            source_url = current.input.get("url") if current.kind == ImportJobKind.URL else None
            child_job_ids: list[uuid.UUID] = []
            try:
                async with session.begin_nested():  # linking is best-effort; never lose the imported recipe
                    if current.parent_recipe_id is None:
                        child_job_ids = await spawn_linked_imports(
                            session, recipe, user_id=current.user_id, household_id=current.household_id,
                        )
                    else:
                        await attach_child_to_parent(session, current.parent_recipe_id, recipe, source_url)
            except Exception as error:
                log.warning("Linked recipe handling failed for job %s (%s)", job_id, type(error).__name__)
                report_service_failure("linked_recipe_handling", error=error)
            awaiting_children = bool(child_job_ids)
            current.status = ImportJobStatus.AWAITING_CHILDREN if awaiting_children else ImportJobStatus.SUCCEEDED
            current.outcome = result.outcome or "complete"
            current.failure_code = None
            current.failure_stage = None
            current.result_recipe_id = recipe.id
            if current.parent_recipe_id is None:  # a child keeps its URL so a retry can still find the parent's link
                current.input = {}
            else:
                current.input = _without_captured_html(current.input)
            current.next_attempt_at = None
            current.updated_at = datetime.utcnow()
            await _event_for_job(session, current, "import_job.running" if awaiting_children else "import_job.succeeded")
            await finalize_parent_of_child(session, current)
            source_kind = _final_source_kind(current.kind, result.source_capture)
            renderer_status = result.source_capture.get("render_status")
            fallback_status = result.source_capture.get("fallback_status")
            await session.commit()
            report_missing_critical_fields(
                input_kind=source_kind,
                source_kind=source_kind,
                issue_codes=result.issue_codes,
                source_url=source_url,
                final_outcome=result.outcome,
                failure_stage=result.stage,
                renderer_status=renderer_status,
                fallback_status=fallback_status,
            )
    except Exception as error:
        log.warning("Import job %s failed (%s)", job_id, type(error).__name__)
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
            report_service_failure("recipe_embedding", error=error)
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
        child_job_ids = set((await session.scalars(
            select(ImportJob.id).where(ImportJob.id.in_({event.job_id for event in events}), ImportJob.parent_recipe_id.is_not(None))
        )).all())
        for event in events:
            subscriptions = [] if event.job_id in child_job_ids else list((await session.scalars(select(DeviceSubscription).where(DeviceSubscription.user_id == event.user_id))).all())
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
            log.warning("Import push relay failed: %s", type(error).__name__)
            report_service_failure("import_push_relay", error=error)
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)


async def _awaiting_children_loop() -> None:
    while True:
        try:
            async with async_session_maker() as session:
                if await finalize_overdue_parents(session):
                    await session.commit()
        except Exception as error:
            log.warning("Awaiting-children sweep failed: %s", type(error).__name__)
            report_service_failure("import_awaiting_children", error=error)
        await asyncio.sleep(_AWAITING_CHILDREN_SWEEP_SECONDS)


async def run() -> None:
    await _requeue_stale()
    await recover_running_jobs()
    await asyncio.gather(
        *(_worker_loop() for _ in range(3)),
        *(_embedding_worker_loop() for _ in range(settings.embedding_worker_batch_size)),
        allergen_recheck_worker_loop(_POLL_INTERVAL_SECONDS),
        _push_loop(),
        _awaiting_children_loop(),
    )
