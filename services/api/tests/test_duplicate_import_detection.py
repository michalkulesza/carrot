from contextlib import asynccontextmanager
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from api.models import ImportFailureCode, ImportJob, ImportJobKind, ImportJobStatus
from api.routes import imports as imports_routes
from api.services import import_worker
from api.services.source_urls import normalize_source_url

URL = "https://www.Recipes.example/pasta/?utm_source=x&b=2&a=1#top"


def _job(**overrides) -> ImportJob:
    values = dict(
        id=uuid4(), kind=ImportJobKind.URL, status=ImportJobStatus.RUNNING, failure_code=None,
        input={"url": URL}, dismissed_at=None, user_id=uuid4(), household_id=uuid4(),
        idempotency_key=str(uuid4()), retry_count=0, parent_recipe_id=None,
        created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    values.update(overrides)
    return ImportJob(**values)


@pytest.mark.parametrize("url,expected", [
    ("HTTPS://WWW.Recipes.Example/pasta/", "https://recipes.example/pasta"),
    ("https://recipes.example/pasta#step-2", "https://recipes.example/pasta"),
    ("https://recipes.example/pasta?utm_source=a&UTM_medium=b&fbclid=1&igshid=2&gclid=3&ref=4", "https://recipes.example/pasta"),
    ("https://recipes.example/pasta?b=2&a=1", "https://recipes.example/pasta?a=1&b=2"),
    ("https://recipes.example/", "https://recipes.example"),
    ("https://recipes.example:8080/pasta", "https://recipes.example:8080/pasta"),
    ("  https://recipes.example/pasta  ", "https://recipes.example/pasta"),
])
def test_normalize_source_url(url, expected) -> None:
    assert normalize_source_url(url) == expected


def test_normalize_source_url_keeps_path_case_and_distinct_paths() -> None:
    assert normalize_source_url("https://recipes.example/Pasta") != normalize_source_url("https://recipes.example/pasta")
    assert normalize_source_url("https://recipes.example/pasta?id=1") != normalize_source_url("https://recipes.example/pasta?id=2")


def _lookup_session(rows):
    return SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(all=lambda: rows)))


def _compiled_query(session) -> str:
    return str(session.execute.await_args.args[0])


@pytest.mark.asyncio
async def test_detection_hit_in_household_scope() -> None:
    existing = uuid4()
    session = _lookup_session([(uuid4(), "https://other.example/x"), (existing, "https://recipes.example/pasta?a=1&b=2")])

    found = await import_worker._find_duplicate_recipe_id(session, _job())

    assert found == existing
    assert "recipe_households" in _compiled_query(session)
    assert "author_id" not in _compiled_query(session)


@pytest.mark.asyncio
async def test_detection_personal_scope_filters_by_author() -> None:
    existing = uuid4()
    session = _lookup_session([(existing, "https://recipes.example/pasta/?b=2&a=1")])

    found = await import_worker._find_duplicate_recipe_id(session, _job(household_id=None))

    assert found == existing
    assert "author_id" in _compiled_query(session)
    assert "recipe_households" not in _compiled_query(session)


@pytest.mark.asyncio
async def test_detection_miss_when_candidates_differ() -> None:
    session = _lookup_session([(uuid4(), "https://recipes.example/pasta?a=1"), (uuid4(), "https://recipes.example/risotto")])

    assert await import_worker._find_duplicate_recipe_id(session, _job()) is None


@pytest.mark.parametrize("overrides,expected", [
    ({}, True),
    ({"kind": ImportJobKind.TEXT, "input": {"text": "soup"}}, False),
    ({"kind": ImportJobKind.IMAGE, "input": {}}, False),
    ({"parent_recipe_id": uuid4()}, False),
    ({"input": {"url": URL, "replaces_recipe_id": str(uuid4())}}, False),
    ({"input": {"url": URL, "allow_duplicate": True}}, False),
])
def test_checks_for_duplicate_conditions(overrides, expected) -> None:
    assert import_worker._checks_for_duplicate(_job(**overrides)) is expected


def _process_session(job):
    session = SimpleNamespace(get=AsyncMock(return_value=job), commit=AsyncMock(), expunge=lambda _job: None)

    @asynccontextmanager
    async def maker():
        yield session

    return maker, session


@pytest.mark.asyncio
async def test_process_job_fails_on_duplicate_before_pipeline(monkeypatch) -> None:
    job = _job()
    existing = uuid4()
    maker, session = _process_session(job)
    pipeline = AsyncMock()
    monkeypatch.setattr(import_worker, "async_session_maker", maker)
    monkeypatch.setattr(import_worker, "_is_member", AsyncMock(return_value=True))
    monkeypatch.setattr(import_worker, "_find_duplicate_recipe_id", AsyncMock(return_value=existing))
    monkeypatch.setattr(import_worker, "_event_for_job", AsyncMock())
    monkeypatch.setattr(import_worker, "_run_pipeline", pipeline)

    await import_worker._process_job(job.id)

    assert job.status == ImportJobStatus.FAILED
    assert job.failure_code == ImportFailureCode.DUPLICATE_RECIPE
    assert job.duplicate_recipe_id == existing
    assert job.next_attempt_at is None
    import_worker._event_for_job.assert_awaited_once_with(session, job, "import_job.failed")
    pipeline.assert_not_awaited()


@pytest.mark.asyncio
async def test_process_job_skips_lookup_when_allowed(monkeypatch) -> None:
    job = _job(input={"url": URL, "allow_duplicate": True})
    maker, _ = _process_session(job)
    lookup = AsyncMock()
    monkeypatch.setattr(import_worker, "async_session_maker", maker)
    monkeypatch.setattr(import_worker, "_is_member", AsyncMock(return_value=True))
    monkeypatch.setattr(import_worker, "_find_duplicate_recipe_id", lookup)
    monkeypatch.setattr(import_worker, "_get_tags_and_allergens", AsyncMock(return_value=([], [])))
    monkeypatch.setattr(import_worker, "_run_pipeline", AsyncMock(side_effect=RuntimeError("stop")))
    monkeypatch.setattr(import_worker, "_fail_or_retry", AsyncMock())

    await import_worker._process_job(job.id)

    lookup.assert_not_awaited()
    import_worker._run_pipeline.assert_awaited_once()


@pytest.fixture
def endpoint(monkeypatch):
    session = SimpleNamespace(commit=AsyncMock())
    state = SimpleNamespace(job=_job(status=ImportJobStatus.FAILED, failure_code=ImportFailureCode.DUPLICATE_RECIPE, duplicate_recipe_id=uuid4()))
    monkeypatch.setattr(imports_routes, "_action_job", AsyncMock(side_effect=lambda *_: state.job))
    monkeypatch.setattr(imports_routes, "_event_for_job", AsyncMock())
    monkeypatch.setattr(imports_routes, "_creator_name", AsyncMock(return_value="Ann"))

    async def call():
        return await imports_routes.import_anyway(state.job.id, SimpleNamespace(), session)

    state.call = call
    return state


@pytest.mark.asyncio
async def test_import_anyway_requeues_with_allow_duplicate(endpoint) -> None:
    out = await endpoint.call()

    job = endpoint.job
    assert job.status == ImportJobStatus.PENDING
    assert job.failure_code is None
    assert job.duplicate_recipe_id is None
    assert job.input == {"url": URL, "allow_duplicate": True}
    assert job.retry_count == 0
    assert out.status == ImportJobStatus.PENDING
    assert out.duplicate_recipe_id is None


@pytest.mark.asyncio
async def test_import_anyway_second_call_conflicts(endpoint) -> None:
    await endpoint.call()

    with pytest.raises(HTTPException) as error:
        await endpoint.call()

    assert error.value.status_code == 409
    assert error.value.detail == "import_job_cannot_import_anyway"


@pytest.mark.asyncio
async def test_import_anyway_rejects_other_failures(endpoint) -> None:
    endpoint.job.failure_code = ImportFailureCode.NO_RECIPE_CONTENT

    with pytest.raises(HTTPException) as error:
        await endpoint.call()

    assert error.value.status_code == 409
