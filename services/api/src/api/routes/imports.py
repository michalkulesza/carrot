import asyncio
import base64
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import (
    Household,
    ImportJob,
    ImportJobCreate,
    ImportJobOut,
    ImportJobStatus,
    ImportRequest,
    ImportResult,
    Tag,
    UserPreferences,
)
from api.services.pipeline import (
    run_image_import,
    run_image_import_stream,
    run_import,
    run_import_stream,
    run_text_import_stream,
)
from api.users import User, current_active_user

router = APIRouter(prefix="/imports", tags=["imports"])


async def _get_tags_and_allergens(
    user: User,
    session: AsyncSession,
) -> tuple[list[str], list[str]]:
    result = await session.execute(
        select(Tag).where(or_(Tag.is_default.is_(True), Tag.user_id == user.id))
    )
    available_tags = [t.name for t in result.scalars().all()]

    allergens: list[str] = []
    if user.active_household_id:
        household = await session.get(Household, user.active_household_id)
        if household and household.allergens:
            a = household.allergens
            allergens = list(a.get("predefined") or []) + list(a.get("custom") or [])
    else:
        prefs_result = await session.execute(
            select(UserPreferences).where(UserPreferences.user_id == user.id)
        )
        prefs = prefs_result.scalar_one_or_none()
        if prefs and prefs.personal_allergens:
            a = prefs.personal_allergens
            allergens = list(a.get("predefined") or []) + list(a.get("custom") or [])

    return available_tags, allergens


@router.post("", response_model=ImportResult)
async def create_import(body: ImportRequest) -> ImportResult:
    return await run_import(body.url)


@router.get("/stream")
async def stream_import(
    url: str,
    model: str = "gemini-2.5-flash-lite",
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> StreamingResponse:
    available_tags, allergens = await _get_tags_and_allergens(user, session)

    async def generate():
        async for event in run_import_stream(url, model=model, available_tags=available_tags, allergens=allergens or None):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class TextImportBody(BaseModel):
    text: str
    model: str = "gemini-2.5-flash-lite"


@router.post("/stream-text")
async def stream_text_import(
    body: TextImportBody,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> StreamingResponse:
    available_tags, allergens = await _get_tags_and_allergens(user, session)

    async def generate():
        async for event in run_text_import_stream(body.text, model=body.model, available_tags=available_tags, allergens=allergens or None):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class ImageImportBody(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"
    model: str = "gemini-2.5-flash-lite"


@router.post("/image", response_model=ImportResult)
async def create_image_import(
    body: ImageImportBody,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ImportResult:
    image_data = base64.b64decode(body.image_base64)
    available_tags, allergens = await _get_tags_and_allergens(user, session)
    try:
        return await asyncio.wait_for(
            run_image_import(
                image_data, body.mime_type, model=body.model,
                available_tags=available_tags, allergens=allergens or None,
            ),
            timeout=35.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail="Recognition timed out, please try again.")


@router.post("/stream-image")
async def stream_image_import(
    body: ImageImportBody,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> StreamingResponse:
    image_data = base64.b64decode(body.image_base64)
    available_tags, allergens = await _get_tags_and_allergens(user, session)

    async def generate():
        async for event in run_image_import_stream(image_data, body.mime_type, model=body.model, available_tags=available_tags, allergens=allergens or None):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Background import jobs ─────────────────────────────────────────────────────

@router.post("/jobs", response_model=ImportJobOut, status_code=201)
async def enqueue_import_job(
    body: ImportJobCreate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ImportJobOut:
    job = ImportJob(
        user_id=user.id,
        status=ImportJobStatus.PENDING,
        kind=body.kind,
        input=body.input,
        model=body.model,
        activity_push_token=body.activity_push_token,
        device_push_token=body.device_push_token,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return ImportJobOut.model_validate(job)


@router.get("/jobs/{job_id}", response_model=ImportJobOut)
async def get_import_job(
    job_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ImportJobOut:
    job = await session.get(ImportJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return ImportJobOut.model_validate(job)
