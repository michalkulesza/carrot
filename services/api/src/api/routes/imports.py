import asyncio
import base64
import binascii
import json
import uuid
from datetime import datetime
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import async_session_maker, get_async_session
from api.models import (
    CapturedHtmlSubmit,
    ImportFailureCode,
    DeviceSubscription,
    DeviceSubscriptionCreate,
    HouseholdMember,
    ImportJob,
    ImportJobCreate,
    ImportJobEvent,
    ImportJobKind,
    ImportJobOut,
    ImportJobStatus,
)
from api.routes.context import get_active_household_id
from api.services.extraction_v2.production import is_html_source
from api.users import User, current_active_user

router = APIRouter(prefix="/imports", tags=["imports"])
_ACTIVE_STATUSES = (ImportJobStatus.PENDING, ImportJobStatus.RUNNING, ImportJobStatus.AWAITING_CHILDREN)
_MAX_IMAGE_BYTES = 8 * 1024 * 1024
_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
_MAX_CAPTURED_HTML_BYTES = 3 * 1024 * 1024
_DEVICE_CAPTURE_FAILURE_CODES = {ImportFailureCode.SOURCE_FETCH_FAILED, ImportFailureCode.USER_ACTION_REQUIRED}


def _scope_filter(model, household_id: uuid.UUID, user_id: uuid.UUID):
    return or_(model.household_id == household_id, and_(model.household_id.is_(None), model.user_id == user_id))


def is_device_capture_eligible(job: ImportJob) -> bool:
    url = (job.input or {}).get("url")
    return bool(
        job.kind == ImportJobKind.URL
        and job.status == ImportJobStatus.FAILED
        and job.dismissed_at is None
        and job.failure_code in _DEVICE_CAPTURE_FAILURE_CODES
        and isinstance(url, str)
        and is_html_source(url)
    )


def _hosts_are_related(first: str, second: str) -> bool:
    first_host = (urlsplit(first).hostname or "").casefold().rstrip(".")
    second_host = (urlsplit(second).hostname or "").casefold().rstrip(".")
    if not first_host or not second_host:
        return False
    return first_host == second_host or first_host.endswith(f".{second_host}") or second_host.endswith(f".{first_host}")


def _job_out(job: ImportJob, creator_name: str | None) -> ImportJobOut:
    source_url = job.input.get("url") if job.kind == "url" else None
    status = ImportJobStatus.RUNNING if job.status == ImportJobStatus.AWAITING_CHILDREN else job.status
    return ImportJobOut(
        id=job.id,
        status=status,
        kind=job.kind,
        source_url=source_url,
        household_id=job.household_id,
        created_by_user_id=job.user_id,
        created_by_name=creator_name,
        result_recipe_id=job.result_recipe_id,
        failure_code=job.failure_code,
        failure_stage=job.failure_stage,
        outcome=job.outcome,
        retry_count=job.retry_count,
        next_attempt_at=job.next_attempt_at,
        device_capture_eligible=is_device_capture_eligible(job),
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def is_hidden_child(
    child_event_time: datetime | None,
    parent_status: str,
    parent_updated_at: datetime,
) -> bool:
    """A child import is hidden while its parent waits, and for events emitted as the parent finishes."""
    if parent_status == ImportJobStatus.AWAITING_CHILDREN:
        return True
    return child_event_time is not None and parent_status == ImportJobStatus.SUCCEEDED and parent_updated_at >= child_event_time


async def _hidden_child_job_ids(
    session: AsyncSession, jobs: list[ImportJob], event_times: dict[uuid.UUID, datetime] | None = None,
) -> set[uuid.UUID]:
    children = [job for job in jobs if job.parent_recipe_id is not None]
    if not children:
        return set()
    parents = (await session.execute(
        select(ImportJob.result_recipe_id, ImportJob.user_id, ImportJob.status, ImportJob.updated_at).where(
            ImportJob.result_recipe_id.in_({job.parent_recipe_id for job in children}),
            ImportJob.parent_recipe_id.is_(None),
        )
    )).all()
    parent_by_key = {(recipe_id, user_id): (status, updated_at) for recipe_id, user_id, status, updated_at in parents}
    hidden: set[uuid.UUID] = set()
    for child in children:
        parent = parent_by_key.get((child.parent_recipe_id, child.user_id))
        if parent is not None and is_hidden_child((event_times or {}).get(child.id), *parent):
            hidden.add(child.id)
    return hidden


async def _creator_name(session: AsyncSession, user_id: uuid.UUID) -> str | None:
    creator = await session.get(User, user_id)
    return creator.nickname if creator else None


async def _event_for_job(session: AsyncSession, job: ImportJob, event_type: str) -> ImportJobEvent:
    payload = _job_out(job, await _creator_name(session, job.user_id)).model_dump(mode="json")
    event = ImportJobEvent(
        job_id=job.id,
        household_id=job.household_id,
        user_id=job.user_id,
        type=event_type,
        payload=payload,
    )
    session.add(event)
    return event


def _validate_input(body: ImportJobCreate) -> None:
    value = body.input
    if body.kind == "url" and isinstance(value.get("url"), str) and value["url"].strip():
        return
    if body.kind == "text" and isinstance(value.get("text"), str) and value["text"].strip():
        return
    if body.kind == "image" and isinstance(value.get("image_base64"), str):
        encoded = value["image_base64"]
        if value.get("mime_type", "image/jpeg") in _IMAGE_MIME_TYPES and len(encoded) <= ((_MAX_IMAGE_BYTES + 2) // 3) * 4:
            try:
                image = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error):
                pass
            else:
                if 0 < len(image) <= _MAX_IMAGE_BYTES:
                    return
    raise HTTPException(status_code=422, detail="invalid_import_input")


async def _authorize_action(
    job: ImportJob,
    user: User,
    session: AsyncSession,
) -> None:
    if job.household_id is None:
        if job.user_id != user.id:
            raise HTTPException(status_code=403, detail="not_a_household_member")
        return
    member = await session.get(HouseholdMember, {"household_id": job.household_id, "user_id": user.id})
    if member is None:
        raise HTTPException(status_code=403, detail="not_a_household_member")


@router.post("/jobs", response_model=ImportJobOut, status_code=201)
async def enqueue_import_job(
    body: ImportJobCreate,
    response: Response,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> ImportJobOut:
    _validate_input(body)
    existing = await session.scalar(
        select(ImportJob).where(
            ImportJob.user_id == user.id,
            ImportJob.idempotency_key == body.idempotency_key,
        )
    )
    if existing is not None:
        response.status_code = 200
        return _job_out(existing, await _creator_name(session, existing.user_id))

    active_count = await session.scalar(
        select(func.count()).select_from(ImportJob).where(
            ImportJob.user_id == user.id,
            ImportJob.status.in_(_ACTIVE_STATUSES),
        )
    )
    if (active_count or 0) >= 20:
        raise HTTPException(status_code=429, detail="import_queue_full")

    job = ImportJob(
        user_id=user.id,
        household_id=household_id,
        idempotency_key=body.idempotency_key,
        status=ImportJobStatus.PENDING,
        kind=body.kind,
        input=body.input,
        model=body.model,
        next_attempt_at=datetime.utcnow(),
    )
    session.add(job)
    await session.flush()
    await _event_for_job(session, job, "import_job.created")
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(
            select(ImportJob).where(ImportJob.user_id == user.id, ImportJob.idempotency_key == body.idempotency_key)
        )
        if existing is None:
            raise
        response.status_code = 200
        return _job_out(existing, await _creator_name(session, existing.user_id))
    return _job_out(job, user.nickname)


@router.get("/jobs/events")
async def import_job_events(
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID = Depends(get_active_household_id),
) -> StreamingResponse:
    event_scope = _scope_filter(ImportJobEvent, household_id, user.id)
    watermark = await session.scalar(select(func.max(ImportJobEvent.id)).where(event_scope)) or 0
    jobs = list((await session.scalars(
        select(ImportJob)
        .where(
            _scope_filter(ImportJob, household_id, user.id),
            ImportJob.dismissed_at.is_(None),
            ImportJob.status.in_((*_ACTIVE_STATUSES, ImportJobStatus.FAILED)),
        )
        .order_by(ImportJob.created_at)
    )).all())
    hidden = await _hidden_child_job_ids(session, jobs)
    snapshot = [
        _job_out(job, await _creator_name(session, job.user_id)).model_dump(mode="json")
        for job in jobs if job.id not in hidden
    ]
    await session.commit()
    await session.close()

    try:
        cursor = max(int(last_event_id or "0"), watermark)
    except ValueError:
        cursor = watermark

    async def generate():
        nonlocal cursor
        yield f"id: {watermark}\nevent: import_jobs.snapshot\ndata: {json.dumps({'jobs': snapshot})}\n\n"
        while True:
            async with async_session_maker() as event_session:
                rows = list((await event_session.scalars(
                    select(ImportJobEvent)
                    .where(_scope_filter(ImportJobEvent, household_id, user.id), ImportJobEvent.id > cursor)
                    .order_by(ImportJobEvent.id)
                    .limit(100)
                )).all())
            if rows:
                async with async_session_maker() as hidden_session:
                    event_jobs = list((await hidden_session.scalars(
                        select(ImportJob).where(ImportJob.id.in_({row.job_id for row in rows}))
                    )).all())
                    event_times = {row.job_id: row.created_at for row in rows}
                    hidden = await _hidden_child_job_ids(hidden_session, event_jobs, event_times)
                for row in rows:
                    cursor = row.id
                    if row.job_id in hidden:
                        continue
                    data = json.dumps(row.payload, default=str)
                    yield f"id: {row.id}\nevent: {row.type}\ndata: {data}\n\n"
                continue
            yield ": heartbeat\n\n"
            await asyncio.sleep(15)

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def _action_job(job_id: uuid.UUID, user: User, session: AsyncSession) -> ImportJob:
    job = await session.scalar(select(ImportJob).where(ImportJob.id == job_id).with_for_update())
    if job is None:
        raise HTTPException(status_code=404, detail="import_job_not_found")
    await _authorize_action(job, user, session)
    return job


@router.post("/jobs/{job_id}/retry", response_model=ImportJobOut)
async def retry_import_job(job_id: uuid.UUID, user: User = Depends(current_active_user), session: AsyncSession = Depends(get_async_session)) -> ImportJobOut:
    job = await _action_job(job_id, user, session)
    if job.status != ImportJobStatus.FAILED or not job.input:
        raise HTTPException(status_code=409, detail="import_job_cannot_retry")
    job.status = ImportJobStatus.PENDING
    job.failure_code = None
    job.diagnostic_error = None
    job.retry_count = 0
    job.started_at = None
    job.next_attempt_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    await _event_for_job(session, job, "import_job.created")
    await session.commit()
    return _job_out(job, await _creator_name(session, job.user_id))


@router.post("/jobs/{job_id}/captured-html", response_model=ImportJobOut)
async def submit_captured_html(
    job_id: uuid.UUID,
    body: CapturedHtmlSubmit,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ImportJobOut:
    job = await _action_job(job_id, user, session)
    if not is_device_capture_eligible(job):
        raise HTTPException(status_code=409, detail="import_job_cannot_accept_capture")
    if len(body.html.encode()) > _MAX_CAPTURED_HTML_BYTES:
        raise HTTPException(status_code=413, detail="captured_html_too_large")
    final_scheme = urlsplit(body.final_url).scheme.lower()
    if not body.html.strip() or final_scheme not in ("http", "https") or not _hosts_are_related(body.final_url, job.input["url"]):
        raise HTTPException(status_code=422, detail="invalid_captured_html")
    job.input = {**job.input, "captured_html": body.html, "captured_final_url": body.final_url}
    job.status = ImportJobStatus.PENDING
    job.failure_code = None
    job.failure_stage = None
    job.outcome = None
    job.diagnostic_error = None
    job.retry_count = 0
    job.started_at = None
    job.next_attempt_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    await _event_for_job(session, job, "import_job.created")
    await session.commit()
    return _job_out(job, await _creator_name(session, job.user_id))


@router.post("/jobs/{job_id}/cancel", response_model=ImportJobOut)
async def cancel_import_job(job_id: uuid.UUID, user: User = Depends(current_active_user), session: AsyncSession = Depends(get_async_session)) -> ImportJobOut:
    from api.services import linked_recipes

    job = await _action_job(job_id, user, session)
    if job.status not in _ACTIVE_STATUSES:
        raise HTTPException(status_code=409, detail="import_job_cannot_cancel")
    if job.status == ImportJobStatus.AWAITING_CHILDREN:
        await linked_recipes.cancel_awaiting_parent(session, job)
        await session.commit()
        return _job_out(job, await _creator_name(session, job.user_id))
    job.status = ImportJobStatus.CANCELLED
    job.input = {}
    job.next_attempt_at = None
    job.updated_at = datetime.utcnow()
    await _event_for_job(session, job, "import_job.cancelled")
    await linked_recipes.finalize_parent_of_child(session, job)
    await session.commit()
    return _job_out(job, await _creator_name(session, job.user_id))


@router.post("/jobs/{job_id}/dismiss", status_code=204)
async def dismiss_import_job(job_id: uuid.UUID, user: User = Depends(current_active_user), session: AsyncSession = Depends(get_async_session)) -> None:
    job = await _action_job(job_id, user, session)
    if job.status != ImportJobStatus.FAILED:
        raise HTTPException(status_code=409, detail="import_job_cannot_dismiss")
    job.dismissed_at = datetime.utcnow()
    job.input = {}
    job.updated_at = datetime.utcnow()
    await _event_for_job(session, job, "import_job.dismissed")
    await session.commit()


@router.put("/devices", status_code=204)
async def register_device_subscription(body: DeviceSubscriptionCreate, user: User = Depends(current_active_user), session: AsyncSession = Depends(get_async_session)) -> None:
    subscription = await session.scalar(select(DeviceSubscription).where(DeviceSubscription.user_id == user.id, DeviceSubscription.installation_id == body.installation_id))
    if subscription is None:
        session.add(DeviceSubscription(user_id=user.id, installation_id=body.installation_id, token=body.token))
    else:
        subscription.token = body.token
        subscription.updated_at = datetime.utcnow()
    await session.commit()


@router.delete("/devices/{installation_id}", status_code=204)
async def unregister_device_subscription(installation_id: str, user: User = Depends(current_active_user), session: AsyncSession = Depends(get_async_session)) -> None:
    await session.execute(delete(DeviceSubscription).where(DeviceSubscription.user_id == user.id, DeviceSubscription.installation_id == installation_id))
    await session.commit()
