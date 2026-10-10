from contextlib import asynccontextmanager
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from api.models import (
    CapturedHtmlSubmit,
    ImportFailureCode,
    ImportJob,
    ImportJobKind,
    ImportJobStatus,
    ImportMetadata,
    ImportResult,
    RecipeExtraction,
)
from api.routes import imports as imports_routes
from api.services import import_worker, recipe_reextraction
from api.services.extraction_v2 import production
from api.services.extraction_v2.contracts import CompleteOutcome, ExtractedRecipe

URL = "https://recipes.example/pasta"


def _job(**overrides) -> ImportJob:
    values = dict(
        id=uuid4(), kind=ImportJobKind.URL, status=ImportJobStatus.FAILED,
        failure_code=ImportFailureCode.SOURCE_FETCH_FAILED, input={"url": URL}, dismissed_at=None,
        user_id=uuid4(), household_id=uuid4(), idempotency_key=str(uuid4()), retry_count=2,
        created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    values.update(overrides)
    return ImportJob(**values)


@pytest.mark.parametrize("overrides,expected", [
    ({}, True),
    ({"failure_code": ImportFailureCode.USER_ACTION_REQUIRED}, True),
    ({"failure_code": ImportFailureCode.NO_RECIPE_CONTENT}, False),
    ({"failure_code": None}, False),
    ({"status": ImportJobStatus.PENDING}, False),
    ({"status": ImportJobStatus.SUCCEEDED}, False),
    ({"kind": ImportJobKind.TEXT, "input": {"text": "soup"}}, False),
    ({"dismissed_at": datetime.utcnow()}, False),
    ({"input": {"url": "https://www.instagram.com/reel/abc"}}, False),
    ({"input": {"url": "https://m.tiktok.com/v/1"}}, False),
    ({"input": {"url": "https://www.youtube.com/watch?v=1"}}, False),
    ({"input": {}}, False),
])
def test_device_capture_eligibility(overrides, expected) -> None:
    assert imports_routes.is_device_capture_eligible(_job(**overrides)) is expected


@pytest.fixture
def endpoint(monkeypatch):
    session = SimpleNamespace(commit=AsyncMock())
    state = SimpleNamespace(job=_job())
    monkeypatch.setattr(imports_routes, "_action_job", AsyncMock(side_effect=lambda *_: state.job))
    monkeypatch.setattr(imports_routes, "_event_for_job", AsyncMock())
    monkeypatch.setattr(imports_routes, "_creator_name", AsyncMock(return_value="Ann"))
    monkeypatch.setattr(imports_routes, "_MAX_CAPTURED_HTML_BYTES", 64)

    async def submit(html="<html>recipe</html>", final_url=URL):
        return await imports_routes.submit_captured_html(
            state.job.id, CapturedHtmlSubmit(html=html, final_url=final_url), SimpleNamespace(), session,
        )

    state.submit = submit
    return state


async def _status(coro) -> int:
    with pytest.raises(HTTPException) as error:
        await coro
    return error.value.status_code


@pytest.mark.asyncio
async def test_submit_flips_job_to_pending_and_keeps_url(endpoint) -> None:
    out = await endpoint.submit(final_url="https://www.recipes.example/pasta?x=1")

    job = endpoint.job
    assert job.status == ImportJobStatus.PENDING
    assert job.failure_code is None
    assert job.retry_count == 0
    assert job.input["url"] == URL
    assert job.input["captured_html"] == "<html>recipe</html>"
    assert job.input["captured_final_url"] == "https://www.recipes.example/pasta?x=1"
    assert out.status == ImportJobStatus.PENDING
    assert out.device_capture_eligible is False


@pytest.mark.asyncio
async def test_second_submit_conflicts(endpoint) -> None:
    await endpoint.submit()

    assert await _status(endpoint.submit()) == 409


@pytest.mark.asyncio
async def test_submit_rejects_ineligible_job(endpoint) -> None:
    endpoint.job.failure_code = ImportFailureCode.NO_RECIPE_CONTENT

    assert await _status(endpoint.submit()) == 409


@pytest.mark.asyncio
async def test_submit_rejects_oversize_html(endpoint) -> None:
    assert await _status(endpoint.submit(html="x" * 65)) == 413


@pytest.mark.asyncio
@pytest.mark.parametrize("html,final_url", [
    ("   ", URL),
    ("<html>recipe</html>", "ftp://recipes.example/pasta"),
    ("<html>recipe</html>", "https://evil.example/pasta"),
    ("<html>recipe</html>", "https://notrecipes.example/pasta"),
])
async def test_submit_rejects_invalid_payload(endpoint, html, final_url) -> None:
    assert await _status(endpoint.submit(html=html, final_url=final_url)) == 422
    assert endpoint.job.status == ImportJobStatus.FAILED


def test_is_html_source() -> None:
    assert production.is_html_source("https://recipes.example/a")
    assert not production.is_html_source("https://www.instagram.com/reel/1")
    assert not production.is_html_source("https://youtu.be/1")


@pytest.mark.asyncio
async def test_captured_html_skips_renderer_and_fetch(monkeypatch) -> None:
    html = "<html><head><meta property='og:image' content='/pic.jpg'></head><body>Recipe</body></html>"
    seen = {}

    async def extract(payload):
        seen.update(payload)
        return CompleteOutcome(outcome="complete", source_url=payload["source_url"], evidence=[], trace=[], recipe=ExtractedRecipe())

    def forbidden(*_args, **_kwargs):
        raise AssertionError("captured HTML must not be fetched or rendered")

    monkeypatch.setattr(production, "render_url", forbidden)
    monkeypatch.setattr(production, "_fetch_html", forbidden)
    monkeypatch.setattr(import_worker, "acquire_and_extract_url", forbidden)
    monkeypatch.setattr(production, "create_production_orchestrator", lambda _usage: SimpleNamespace(extract=extract))
    monkeypatch.setattr(import_worker, "_enrich_v2", AsyncMock(return_value=RecipeExtraction(title="Pasta")))
    job = _job(input={"url": URL + "?secret=1", "captured_html": html, "captured_final_url": "https://recipes.example/final"})

    result = await import_worker._run_pipeline(job, [], [])

    assert seen["html"] == html
    assert seen["source_url"] == "https://recipes.example/final"
    assert result.source_capture["render_status"] == "device_capture"
    assert result.source_capture["requested_url"] == "https://recipes.example"
    assert result.metadata.thumbnail_url == "https://recipes.example/pic.jpg"
    assert result.trace[-1]["event"] == "html_device_capture"


def _session_returning(job):
    session = SimpleNamespace(scalar=AsyncMock(return_value=job), commit=AsyncMock())

    @asynccontextmanager
    async def maker():
        yield session

    return maker


@pytest.mark.asyncio
async def test_terminal_failure_drops_captured_html(monkeypatch) -> None:
    job = _job(
        status=ImportJobStatus.RUNNING, retry_count=import_worker._MAX_IMPORT_RETRIES,
        input={"url": URL, "captured_html": "<html></html>", "captured_final_url": URL},
    )
    monkeypatch.setattr(import_worker, "async_session_maker", _session_returning(job))
    monkeypatch.setattr(import_worker, "_event_for_job", AsyncMock())
    monkeypatch.setattr(import_worker, "report_recipe_import_failure", lambda **_kwargs: None)

    await import_worker._fail_or_retry(job.id, import_worker.ImportPipelineFailure("no_recipe_content", "input"))

    assert job.status == ImportJobStatus.FAILED
    assert job.input == {"url": URL}


@pytest.mark.asyncio
@pytest.mark.parametrize("code,marks", [("no_recipe_content", True), ("unsupported_source", True), ("source_fetch_failed", False)])
async def test_terminal_child_failure_marks_parent_link_external_only_for_non_recipe_pages(monkeypatch, code, marks) -> None:
    parent_id = uuid4()
    job = _job(status=ImportJobStatus.RUNNING, retry_count=import_worker._MAX_IMPORT_RETRIES, parent_recipe_id=parent_id)
    mark = AsyncMock()
    monkeypatch.setattr(import_worker, "async_session_maker", _session_returning(job))
    monkeypatch.setattr(import_worker, "_event_for_job", AsyncMock())
    monkeypatch.setattr(import_worker, "finalize_parent_of_child", AsyncMock())
    monkeypatch.setattr(import_worker, "mark_link_external", mark)
    monkeypatch.setattr(import_worker, "report_recipe_import_failure", lambda **_kwargs: None)

    await import_worker._fail_or_retry(job.id, import_worker.ImportPipelineFailure(code, "input"))

    if marks:
        mark.assert_awaited_once_with(ANY, parent_id, URL)
    else:
        mark.assert_not_awaited()


@pytest.mark.asyncio
async def test_transient_failure_keeps_captured_html(monkeypatch) -> None:
    job = _job(status=ImportJobStatus.RUNNING, retry_count=0, input={"url": URL, "captured_html": "<html></html>"})
    monkeypatch.setattr(import_worker, "async_session_maker", _session_returning(job))
    monkeypatch.setattr(import_worker, "_event_for_job", AsyncMock())

    await import_worker._fail_or_retry(job.id, import_worker.ImportPipelineFailure("model_timeout", "enrichment"))

    assert job.status == ImportJobStatus.PENDING
    assert job.input["captured_html"] == "<html></html>"


def _extraction_result():
    extraction = RecipeExtraction(title="New title", source_title="New title", servings=2, total_time_minutes=10)
    return ImportResult(
        stage="transcript", recipe=extraction, metadata=ImportMetadata(source_url="https://recipes.example/final"),
        outcome="complete", issue_codes=[], evidence=[], trace=[], source_capture={"kind": "html"},
    )


def _replace_session(recipe, in_household=True):
    def forbidden_add(_obj):
        raise AssertionError("replace must not add a recipe")

    return SimpleNamespace(
        scalar=AsyncMock(return_value=recipe.id if in_household else None),
        get=AsyncMock(side_effect=lambda model, *_a, **_k: recipe if model is import_worker.Recipe else None),
        merge=AsyncMock(),
        add=forbidden_add,
    )


@pytest.mark.asyncio
async def test_replace_updates_recipe_in_place_and_keeps_links(monkeypatch) -> None:
    child_id = uuid4()
    recipe = SimpleNamespace(
        id=uuid4(), title="Old", source_title="Old", source_url=URL, thumbnail_url=None, creator_handle=None, notes=None,
        components=[{"ingredient_links": ["https://recipes.example/sauce/"], "linked_recipe_ids": [str(child_id)]}],
    )
    new_components = [{"ingredient_links": ["https://recipes.example/sauce"], "ingredients": ["sauce"]}]
    monkeypatch.setattr(recipe_reextraction, "serialize_components", lambda *_: new_components)
    monkeypatch.setattr(import_worker, "_archive_thumbnail", AsyncMock())
    monkeypatch.setattr(import_worker, "queue_recipe_embedding", AsyncMock())
    session = _replace_session(recipe)
    job = _job(input={"url": URL, "replaces_recipe_id": str(recipe.id)})

    replaced = await import_worker._replace_recipe(session, job, _extraction_result())

    assert replaced is recipe
    assert recipe.title == "New title"
    assert recipe.source_url == "https://recipes.example/final"
    assert recipe.components[0]["linked_recipe_ids"] == [str(child_id)]
    session.merge.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("input_extra,in_household", [
    ({}, True),
    ({"replaces_recipe_id": "nope"}, True),
    ({"replaces_recipe_id": str(uuid4())}, False),
])
async def test_replace_is_skipped_without_valid_in_household_target(input_extra, in_household) -> None:
    recipe = SimpleNamespace(id=uuid4())
    job = _job(input={"url": URL, **input_extra})

    assert await import_worker._replace_recipe(_replace_session(recipe, in_household), job, _extraction_result()) is None
