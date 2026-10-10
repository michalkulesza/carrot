from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from api.models import AllergenFlag, ImportJob, ImportJobStatus, LinkedRecipeImportRequest
from api.routes import imports as imports_route
from api.routes import recipes as recipes_route
from api.services import allergen_rechecks, import_worker, linked_recipes


class FakeSession:
    def __init__(self, recipes=(), scalar=None) -> None:
        self.recipes = list(recipes)
        self.scalar = AsyncMock(side_effect=scalar if isinstance(scalar, list) else None, return_value=scalar)
        self.scalars = AsyncMock(return_value=SimpleNamespace(all=lambda: self.recipes))


def _recipe(allergen_status="analyzed", components=None, source_url=None, recipe_id=None):
    return SimpleNamespace(
        id=recipe_id or uuid4(), allergen_status=allergen_status, components=components or [],
        source_url=source_url,
    )


def _component(links, ids=None, flags=None, kinds=None):
    return {
        "ingredients": [f"item {index}" for index, _ in enumerate(links)],
        "ingredient_links": links, "linked_recipe_ids": ids or [None] * len(links),
        "ingredient_link_kinds": kinds or ["recipe" if link else None for link in links],
        "ingredient_flags": flags if flags is not None else [{"allergen": None} for _ in links],
    }


def test_normalize_link_ignores_fragment_trailing_slash_and_host_case() -> None:
    assert linked_recipes.normalize_link("HTTPS://Example.com/Sauce/#top") == "https://example.com/Sauce"
    assert linked_recipes.normalize_link("https://example.com/sauce?x=1") == "https://example.com/sauce?x=1"
    assert linked_recipes.normalize_link("mailto:a@b.c") is None
    assert linked_recipes.normalize_link(None) is None


def test_linked_urls_dedupes_skips_own_url_and_caps() -> None:
    components = [
        _component(["https://own.test/x", "https://OWN.test/x/", None, "https://own.test/r", "ftp://own.test/y"]),
        _component([f"https://www.own.test/{index}" for index in range(10)]),
    ]

    urls = linked_recipes.linked_urls(components, "https://own.test/r/#c")

    assert urls == ["https://own.test/x"] + [f"https://www.own.test/{index}" for index in range(4)]


def test_linked_urls_skips_cross_site_shop_links() -> None:
    components = [{"ingredient_links": ["https://amzn.to/3ImXC2w", "https://www.target.com/p/x", "https://own.test/sauce"]}]

    assert linked_recipes.linked_urls(components, "https://www.own.test/r") == ["https://own.test/sauce"]


def test_with_link_kinds_marks_same_site_as_recipe_and_cross_site_as_external() -> None:
    components = [{"ingredient_links": ["https://www.own.test/a", "https://amzn.to/x", None, "https://own.test/b/"]}]

    kinds = linked_recipes.with_link_kinds(components, "https://own.test/r", {"https://own.test/b"})

    assert kinds[0]["ingredient_link_kinds"] == ["recipe", "external", None, "external"]
    assert "ingredient_link_kinds" not in components[0]


def test_with_link_kinds_treats_everything_as_external_without_source_url() -> None:
    kinds = linked_recipes.with_link_kinds([{"ingredient_links": ["https://own.test/a"]}], None)

    assert kinds[0]["ingredient_link_kinds"] == ["external"]


def test_link_kinds_computes_legacy_components_and_trusts_stored_kinds() -> None:
    legacy = {"ingredient_links": ["https://own.test/a", "https://shop.test/b", None]}
    stored = {"ingredient_links": ["https://own.test/a", None], "ingredient_link_kinds": ["external", None]}

    assert linked_recipes.link_kinds(legacy, "https://own.test/r") == ["recipe", "external", None]
    assert linked_recipes.link_kinds(stored, "https://own.test/r") == ["external", None]


def test_linked_urls_and_recipe_link_urls_ignore_external_kinds() -> None:
    components = [_component(["https://own.test/a", "https://own.test/b"], kinds=["recipe", "external"])]

    assert linked_recipes.linked_urls(components, "https://own.test/r") == ["https://own.test/a"]
    assert linked_recipes.recipe_link_urls(components, "https://own.test/r") == {"https://own.test/a"}


def test_preserved_external_urls_requires_same_link_on_same_line() -> None:
    stored = _component(["https://own.test/a", "https://own.test/b"], kinds=["external", "external"])

    preserved = linked_recipes.preserved_external_urls(stored, ["https://own.test/a", "https://own.test/c"])

    assert preserved == {"https://own.test/a"}


def test_set_linked_recipe_ids_matches_normalised_links_only() -> None:
    child_id = uuid4()
    components = [_component(["https://a.test/x/", "https://a.test/other", None])]

    updated, matched = linked_recipes.set_linked_recipe_ids(components, {"https://a.test/x": child_id})

    assert matched == 1
    assert updated[0]["linked_recipe_ids"] == [str(child_id), None, None]
    assert components[0]["linked_recipe_ids"] == [None, None, None]


@pytest.mark.asyncio
async def test_resolve_marks_missing_or_unlinked_recipe_unresolved() -> None:
    components = [_component(["https://a.test/x", None])]

    resolved, status = await linked_recipes.resolve_linked_allergens(FakeSession(), components)

    assert status == "uncertain"
    assert resolved[0]["ingredient_flags"][0]["linked_allergens"] is None
    assert "linked_allergens" not in resolved[0]["ingredient_flags"][1]


def test_recipe_allergens_prefers_linked_recipe_over_line_flag() -> None:
    components = [{"ingredient_flags": [
        {"allergen": "milk", "linked_allergens": ["eggs"]},
        {"allergen": "gluten", "linked_allergens": None},
        {"allergen": "fish", "linked_allergens": []},
        {"allergen": "soy", "substitute_applied": True},
    ]}]

    assert linked_recipes.recipe_allergens(components) == ["eggs", "gluten"]


@pytest.mark.asyncio
async def test_resolve_collects_own_and_inherited_allergens_from_analysed_child() -> None:
    child = _recipe(components=[{"ingredient_flags": [
        {"allergen": "soy"}, {"allergen": None, "linked_allergens": ["sesame", "soy"]}, None,
    ]}])
    components = [_component(["https://a.test/x"], [str(child.id)])]

    resolved, status = await linked_recipes.resolve_linked_allergens(FakeSession([child]), components)

    assert status == "analyzed"
    assert resolved[0]["ingredient_flags"][0]["linked_allergens"] == ["sesame", "soy"]


@pytest.mark.asyncio
async def test_resolve_keeps_empty_list_for_analysed_child_without_allergens() -> None:
    child = _recipe(components=[{"ingredient_flags": [{"allergen": None}]}])
    components = [_component(["https://a.test/x"], [str(child.id)])]

    resolved, status = await linked_recipes.resolve_linked_allergens(FakeSession([child]), components)

    assert status == "analyzed"
    assert resolved[0]["ingredient_flags"][0]["linked_allergens"] == []


@pytest.mark.asyncio
@pytest.mark.parametrize("child_status", ["uncertain", "unknown"])
async def test_resolve_leaves_unanalysed_child_unresolved(child_status) -> None:
    child = _recipe(allergen_status=child_status, components=[{"ingredient_flags": [{"allergen": "soy"}]}])
    components = [_component(["https://a.test/x"], [str(child.id)])]

    resolved, status = await linked_recipes.resolve_linked_allergens(FakeSession([child]), components)

    assert status == "uncertain"
    assert resolved[0]["ingredient_flags"][0]["linked_allergens"] is None


@pytest.mark.asyncio
async def test_resolve_treats_deleted_child_as_unresolved() -> None:
    components = [_component(["https://a.test/x"], [str(uuid4())], [{"allergen": None, "linked_allergens": ["soy"]}])]

    resolved, status = await linked_recipes.resolve_linked_allergens(FakeSession([]), components)

    assert status == "uncertain"
    assert resolved[0]["ingredient_flags"][0]["linked_allergens"] is None


@pytest.fixture
def spawn_mocks(monkeypatch):
    mocks = SimpleNamespace(
        existing=AsyncMock(return_value={}), related=AsyncMock(), enqueue=AsyncMock(), event=AsyncMock(),
    )
    monkeypatch.setattr(linked_recipes, "_household_recipes_by_url", mocks.existing)
    monkeypatch.setattr(linked_recipes, "add_related_recipes", mocks.related)
    monkeypatch.setattr(linked_recipes, "_event_for_job", mocks.event)
    monkeypatch.setattr(allergen_rechecks, "enqueue_recipe_allergen_check", mocks.enqueue)
    return mocks


def _parent(links):
    return _recipe(components=[_component(links)], source_url="https://a.test/r")


def _owner():
    return {"user_id": uuid4(), "household_id": uuid4()}


@pytest.mark.asyncio
async def test_spawn_queues_one_job_per_unique_url(spawn_mocks) -> None:
    session = FakeSession(scalar=uuid4())
    session.get = AsyncMock()

    await linked_recipes.spawn_linked_imports(
        session, _parent(["https://a.test/x", "https://a.test/x/", "https://a.test/r", "https://a.test/y"]), **_owner(),
    )

    assert session.scalar.await_count == 2
    assert spawn_mocks.event.await_count == 2
    spawn_mocks.enqueue.assert_not_awaited()


@pytest.mark.asyncio
async def test_spawn_reuses_existing_household_recipe(spawn_mocks) -> None:
    existing_id = uuid4()
    spawn_mocks.existing.return_value = {"https://a.test/x": existing_id}
    session = FakeSession(scalar=uuid4())
    session.get = AsyncMock()
    parent = _parent(["https://a.test/x", "https://a.test/y"])

    await linked_recipes.spawn_linked_imports(session, parent, **_owner())

    assert parent.components[0]["linked_recipe_ids"] == [str(existing_id), None]
    spawn_mocks.related.assert_awaited_once()
    spawn_mocks.enqueue.assert_awaited_once_with(session, parent.id)
    assert session.scalar.await_count == 1


@pytest.mark.asyncio
async def test_duplicate_child_job_conflict_emits_no_event(spawn_mocks) -> None:
    session = FakeSession(scalar=None)

    await linked_recipes.spawn_linked_imports(session, _parent(["https://a.test/x"]), **_owner())

    spawn_mocks.event.assert_not_awaited()


def test_child_idempotency_key_is_deterministic() -> None:
    parent_id = uuid4()

    assert linked_recipes._child_idempotency_key(parent_id, "https://a.test/x") == linked_recipes._child_idempotency_key(parent_id, "https://a.test/x")
    assert linked_recipes._child_idempotency_key(parent_id, "https://a.test/x") != linked_recipes._child_idempotency_key(parent_id, "https://a.test/y")


@pytest.mark.asyncio
async def test_attach_links_parent_and_rechecks_it(spawn_mocks) -> None:
    parent = _parent(["https://a.test/x/"])
    child = _recipe()
    session = FakeSession()
    session.get = AsyncMock(return_value=parent)

    await linked_recipes.attach_child_to_parent(session, parent.id, child, "https://a.test/x")

    assert parent.components[0]["linked_recipe_ids"] == [str(child.id)]
    spawn_mocks.related.assert_awaited_once_with(session, parent.id, [child.id])
    spawn_mocks.enqueue.assert_awaited_once_with(session, parent.id)


@pytest.mark.asyncio
async def test_attach_ignores_deleted_parent_and_removed_link(spawn_mocks) -> None:
    child = _recipe()
    session = FakeSession()
    session.get = AsyncMock(return_value=None)
    await linked_recipes.attach_child_to_parent(session, uuid4(), child, "https://a.test/x")

    parent = _parent(["https://other.test/z"])
    session.get = AsyncMock(return_value=parent)
    await linked_recipes.attach_child_to_parent(session, parent.id, child, "https://a.test/x")

    spawn_mocks.enqueue.assert_not_awaited()
    spawn_mocks.related.assert_not_awaited()


class RecheckSession:
    def __init__(self, recipe) -> None:
        self.recipe = recipe
        self.job = SimpleNamespace(revision=1)
        self.get = AsyncMock(return_value=recipe)
        self.scalar = AsyncMock(return_value=self.job)
        self.commit = AsyncMock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None


async def _run_recheck(monkeypatch, found_allergen):
    child = _recipe(components=[{"ingredients": ["1 cup milk"], "ingredient_flags": [{"allergen": "milk"}]}])
    session = RecheckSession(child)
    parent_id = uuid4()
    enqueue = AsyncMock()
    monkeypatch.setattr(allergen_rechecks, "async_session_maker", lambda: session)
    monkeypatch.setattr(allergen_rechecks, "_allergens_for_recipe", AsyncMock(return_value=["milk"]))
    monkeypatch.setattr(allergen_rechecks, "_publish_recipe_changed", AsyncMock())
    monkeypatch.setattr(allergen_rechecks, "enqueue_recipe_allergen_check", enqueue)
    monkeypatch.setattr(allergen_rechecks.gemini_svc, "analyze_allergens", AsyncMock(return_value=[AllergenFlag(allergen=found_allergen)]))
    monkeypatch.setattr(linked_recipes, "parent_recipe_ids", AsyncMock(return_value=[parent_id]))

    await allergen_rechecks._process(child.id, 1)

    return enqueue, parent_id


@pytest.mark.asyncio
async def test_recheck_with_unchanged_summary_does_not_enqueue_parents(monkeypatch) -> None:
    enqueue, _ = await _run_recheck(monkeypatch, "milk")

    enqueue.assert_not_awaited()


@pytest.mark.asyncio
async def test_recheck_with_changed_summary_enqueues_parents(monkeypatch) -> None:
    enqueue, parent_id = await _run_recheck(monkeypatch, None)

    enqueue.assert_awaited_once()
    assert enqueue.await_args.args[1] == parent_id


def _job_row(status, **fields):
    return SimpleNamespace(
        id=uuid4(), user_id=uuid4(), household_id=uuid4(), status=status, result_recipe_id=None,
        parent_recipe_id=None, input={}, updated_at=datetime(2026, 1, 1), **fields,
    )


def test_existing_linked_ids_maps_normalised_urls_to_stored_ids() -> None:
    recipe_id = uuid4()
    components = [_component(["https://a.test/x/", None, "https://a.test/y"], [str(recipe_id), None, None])]

    assert linked_recipes.existing_linked_ids(components) == {"https://a.test/x": recipe_id}


@pytest.mark.asyncio
async def test_spawn_returns_new_job_ids_and_skips_resolved_links(spawn_mocks) -> None:
    child_job_id = uuid4()
    session = FakeSession(scalar=child_job_id)
    session.get = AsyncMock()
    resolved_id = uuid4()
    parent = _recipe(components=[_component(["https://a.test/x", "https://a.test/y"], [str(resolved_id), None])], source_url="https://a.test/r")

    created = await linked_recipes.spawn_linked_imports(session, parent, **_owner())

    assert created == [child_job_id]
    assert spawn_mocks.existing.await_args.args[2] == ["https://a.test/y"]


@pytest.mark.asyncio
async def test_import_linked_recipe_attaches_existing_household_recipe(spawn_mocks) -> None:
    existing_id = uuid4()
    spawn_mocks.existing.return_value = {"https://a.test/x": existing_id}
    session = FakeSession()
    parent = _parent(["https://a.test/x"])

    result = await linked_recipes.import_linked_recipe(session, parent, **_owner(), url="https://a.test/x")

    assert result == (existing_id, None)
    assert parent.components[0]["linked_recipe_ids"] == [str(existing_id)]
    spawn_mocks.enqueue.assert_awaited_once_with(session, parent.id)


@pytest.mark.asyncio
async def test_import_linked_recipe_creates_child_job(spawn_mocks) -> None:
    job_id = uuid4()
    session = FakeSession(scalar=job_id)
    session.get = AsyncMock()

    result = await linked_recipes.import_linked_recipe(session, _parent(["https://a.test/x"]), **_owner(), url="https://a.test/x")

    assert result == (None, job_id)
    spawn_mocks.event.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [ImportJobStatus.FAILED, ImportJobStatus.CANCELLED])
async def test_import_linked_recipe_resets_failed_or_cancelled_child(spawn_mocks, status) -> None:
    job = _job_row(status, failure_code="extraction_failed", failure_stage="x", diagnostic_error="e", outcome="failed",
                   retry_count=3, started_at=datetime(2026, 1, 1), dismissed_at=datetime(2026, 1, 1), next_attempt_at=None)
    session = FakeSession(scalar=[None, job])
    session.get = AsyncMock()

    result = await linked_recipes.import_linked_recipe(session, _parent(["https://a.test/x"]), **_owner(), url="https://a.test/x")

    assert result == (None, job.id)
    assert job.status == ImportJobStatus.PENDING
    assert (job.failure_code, job.retry_count, job.dismissed_at, job.input) == (None, 0, None, {"url": "https://a.test/x", "requested_by_user": True})
    spawn_mocks.event.assert_awaited_once()


@pytest.mark.asyncio
async def test_import_linked_recipe_repeated_call_returns_same_pending_job(spawn_mocks) -> None:
    job = _job_row(ImportJobStatus.PENDING)
    session = FakeSession(scalar=[None, job])
    session.get = AsyncMock()

    result = await linked_recipes.import_linked_recipe(session, _parent(["https://a.test/x"]), **_owner(), url="https://a.test/x")

    assert result == (None, job.id)
    spawn_mocks.event.assert_not_awaited()


@pytest.mark.asyncio
async def test_import_linked_recipe_attaches_already_succeeded_child(spawn_mocks) -> None:
    child = _recipe()
    job = _job_row(ImportJobStatus.SUCCEEDED)
    job.result_recipe_id = child.id
    session = FakeSession(scalar=[None, job])
    session.get = AsyncMock(return_value=child)
    parent = _parent(["https://a.test/x"])

    result = await linked_recipes.import_linked_recipe(session, parent, **_owner(), url="https://a.test/x")

    assert result == (child.id, job.id)
    assert parent.components[0]["linked_recipe_ids"] == [str(child.id)]


@pytest.mark.asyncio
async def test_route_rejects_url_not_linked_by_recipe() -> None:
    parent = _parent(["https://a.test/x"])
    session = FakeSession(scalar=parent)

    with pytest.raises(HTTPException) as error:
        await recipes_route.import_linked_recipe_route(
            parent.id, LinkedRecipeImportRequest(url="https://evil.test/z"),
            user=SimpleNamespace(id=uuid4()), session=session, household_id=uuid4(),
        )

    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_route_imports_linked_url_and_commits(monkeypatch) -> None:
    parent = _parent(["https://a.test/x/"])
    job_id = uuid4()
    session = FakeSession(scalar=parent)
    session.commit = AsyncMock()
    monkeypatch.setattr(recipes_route, "import_linked_recipe", AsyncMock(return_value=(None, job_id)))

    out = await recipes_route.import_linked_recipe_route(
        parent.id, LinkedRecipeImportRequest(url="https://a.test/x"),
        user=SimpleNamespace(id=uuid4()), session=session, household_id=uuid4(),
    )

    assert (out.recipe_id, out.job_id) == (None, job_id)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_finalize_waits_while_a_child_is_pending(spawn_mocks) -> None:
    parent_job = _job_row(ImportJobStatus.AWAITING_CHILDREN)
    session = FakeSession(scalar=[parent_job, 1])

    assert not await linked_recipes.finalize_parent_if_ready(session, parent_job.id)
    assert parent_job.status == ImportJobStatus.AWAITING_CHILDREN
    spawn_mocks.event.assert_not_awaited()


@pytest.mark.asyncio
async def test_finalize_succeeds_parent_once_children_are_terminal(spawn_mocks) -> None:
    parent_job = _job_row(ImportJobStatus.AWAITING_CHILDREN)
    session = FakeSession(scalar=[parent_job, 0])

    assert await linked_recipes.finalize_parent_if_ready(session, parent_job.id)
    assert parent_job.status == ImportJobStatus.SUCCEEDED
    assert spawn_mocks.event.await_args.args[2] == "import_job.succeeded"


@pytest.mark.asyncio
async def test_finalize_ignores_parent_that_is_not_waiting(spawn_mocks) -> None:
    parent_job = _job_row(ImportJobStatus.SUCCEEDED)

    assert not await linked_recipes.finalize_parent_if_ready(FakeSession(scalar=[parent_job]), parent_job.id)
    spawn_mocks.event.assert_not_awaited()


@pytest.mark.asyncio
async def test_finalize_parent_of_child_looks_up_the_waiting_parent_job(spawn_mocks) -> None:
    parent_job = _job_row(ImportJobStatus.AWAITING_CHILDREN)
    child = _job_row(ImportJobStatus.FAILED)
    child.parent_recipe_id = uuid4()
    session = FakeSession(scalar=[parent_job.id, parent_job, 0])

    assert await linked_recipes.finalize_parent_of_child(session, child)
    assert parent_job.status == ImportJobStatus.SUCCEEDED
    assert not await linked_recipes.finalize_parent_of_child(FakeSession(), _job_row(ImportJobStatus.FAILED))


@pytest.mark.asyncio
async def test_overdue_parents_are_force_finalised(monkeypatch) -> None:
    ids = [uuid4(), uuid4()]
    finalize = AsyncMock(return_value=True)
    monkeypatch.setattr(linked_recipes, "finalize_parent_if_ready", finalize)

    count = await linked_recipes.finalize_overdue_parents(FakeSession(ids))

    assert count == 2
    assert all(call.kwargs == {"force": True} for call in finalize.await_args_list)


@pytest.mark.asyncio
async def test_cancelling_waiting_parent_cancels_children_and_finishes_it(spawn_mocks, monkeypatch) -> None:
    parent_job = _job_row(ImportJobStatus.AWAITING_CHILDREN)
    children = [_job_row(ImportJobStatus.PENDING, next_attempt_at=datetime(2026, 1, 1)), _job_row(ImportJobStatus.RUNNING, next_attempt_at=None)]
    finalize = AsyncMock()
    monkeypatch.setattr(linked_recipes, "finalize_parent_if_ready", finalize)

    await linked_recipes.cancel_awaiting_parent(FakeSession(children), parent_job)

    assert all(child.status == ImportJobStatus.CANCELLED for child in children)
    finalize.assert_awaited_once_with(ANY, parent_job.id, force=True, event_type="import_job.cancelled")


def test_job_out_serialises_awaiting_children_as_running() -> None:
    job = _job_row(
        ImportJobStatus.AWAITING_CHILDREN, kind="url", created_by=None, failure_code=None, failure_stage=None, outcome=None,
        retry_count=0, next_attempt_at=None, created_at=datetime(2026, 1, 1),
    )

    assert imports_route._job_out(job, None).status == "running"


def test_children_are_hidden_while_parent_waits_or_as_it_finishes() -> None:
    event_time = datetime(2026, 1, 1, 12, 0)

    assert imports_route.is_hidden_child(None, ImportJobStatus.AWAITING_CHILDREN, event_time)
    assert imports_route.is_hidden_child(event_time, ImportJobStatus.SUCCEEDED, event_time + timedelta(seconds=1))
    assert not imports_route.is_hidden_child(event_time, ImportJobStatus.SUCCEEDED, event_time - timedelta(days=1))
    assert not imports_route.is_hidden_child(None, ImportJobStatus.SUCCEEDED, event_time)


@pytest.mark.asyncio
async def test_stale_requeue_only_selects_running_jobs(monkeypatch) -> None:
    statements = []

    class Session:
        async def scalars(self, statement):
            statements.append(str(statement.compile(compile_kwargs={"literal_binds": True})))
            return SimpleNamespace(all=lambda: [])

        commit = AsyncMock()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args) -> None:
            return None

    monkeypatch.setattr(import_worker, "async_session_maker", Session)

    await import_worker._requeue_stale()

    assert "'running'" in statements[0]
    assert "awaiting_children" not in statements[0]


@pytest.mark.asyncio
async def test_list_recipes_excludes_recipes_of_waiting_imports() -> None:
    statements = []

    class Result:
        def scalars(self):
            return SimpleNamespace(all=lambda: [])

        def __iter__(self):
            return iter([])

    class Session:
        async def execute(self, statement):
            statements.append(str(statement.compile(compile_kwargs={"literal_binds": True})))
            return Result()

    await recipes_route.list_recipes(user=SimpleNamespace(id=uuid4()), session=Session(), household_id=uuid4())

    assert "awaiting_children" in statements[0]


class WorkerSession:
    def __init__(self, job, member=True) -> None:
        self.job = job
        self.get = AsyncMock(side_effect=lambda model, _key: job if model is ImportJob else member)
        self.scalar = AsyncMock(return_value=job)
        self.expunge = Mock()
        self.commit = AsyncMock()

    def begin_nested(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None


async def _run_worker_job(monkeypatch, child_job_ids):
    job = SimpleNamespace(
        id=uuid4(), user_id=uuid4(), household_id=uuid4(), status=ImportJobStatus.RUNNING, kind="url",
        input={"url": "https://p.test/r"}, parent_recipe_id=None, result_recipe_id=None, failure_code=None,
        failure_stage=None, next_attempt_at=None, outcome=None, updated_at=None,
    )
    sessions = iter([WorkerSession(job), WorkerSession(job)])
    event = AsyncMock()
    result = SimpleNamespace(outcome="complete", source_capture={}, issue_codes=[], stage="transcript")
    monkeypatch.setattr(import_worker, "async_session_maker", lambda: next(sessions))
    monkeypatch.setattr(import_worker, "_get_tags_and_allergens", AsyncMock(return_value=([], [])))
    monkeypatch.setattr(import_worker, "_run_pipeline", AsyncMock(return_value=result))
    monkeypatch.setattr(import_worker, "_save_recipe", AsyncMock(return_value=_recipe()))
    monkeypatch.setattr(import_worker, "spawn_linked_imports", AsyncMock(return_value=child_job_ids))
    monkeypatch.setattr(import_worker, "finalize_parent_of_child", AsyncMock())
    monkeypatch.setattr(import_worker, "report_missing_critical_fields", Mock())
    monkeypatch.setattr(import_worker, "_event_for_job", event)

    await import_worker._process_job(job.id)

    return job, event


@pytest.mark.asyncio
async def test_worker_keeps_parent_busy_without_success_event_while_children_run(monkeypatch) -> None:
    job, event = await _run_worker_job(monkeypatch, [uuid4()])

    assert job.status == ImportJobStatus.AWAITING_CHILDREN
    assert job.result_recipe_id is not None
    assert event.await_args.args[2] == "import_job.running"


@pytest.mark.asyncio
async def test_worker_succeeds_immediately_without_children(monkeypatch) -> None:
    job, event = await _run_worker_job(monkeypatch, [])

    assert job.status == ImportJobStatus.SUCCEEDED
    assert event.await_args.args[2] == "import_job.succeeded"


@pytest.mark.asyncio
async def test_child_allergen_flows_to_parent_once_every_link_resolves() -> None:
    child = _recipe(components=[{"ingredient_flags": [{"allergen": "gluten"}]}])
    parent_components = [_component(["https://a.test/x"], [str(child.id)])]

    resolved, status = await linked_recipes.resolve_linked_allergens(FakeSession([child]), parent_components)

    assert status == "analyzed"
    assert resolved[0]["ingredient_flags"][0]["linked_allergens"] == ["gluten"]
    assert linked_recipes.recipe_allergens(resolved) == ["gluten"]


@pytest.mark.asyncio
async def test_resolve_ignores_external_links_for_status_and_keeps_own_flags() -> None:
    components = [_component(["https://shop.test/x"], flags=[{"allergen": "soy", "linked_allergens": ["old"]}], kinds=["external"])]

    resolved, status = await linked_recipes.resolve_linked_allergens(FakeSession(), components)

    assert status == "analyzed"
    assert resolved[0]["ingredient_flags"][0]["linked_allergens"] is None
    assert linked_recipes.recipe_allergens(resolved) == ["soy"]


@pytest.mark.asyncio
async def test_resolve_stays_uncertain_when_external_is_mixed_with_unresolved_recipe_link() -> None:
    components = [_component(["https://shop.test/x", "https://a.test/y"], kinds=["external", "recipe"])]

    _, status = await linked_recipes.resolve_linked_allergens(FakeSession(), components)

    assert status == "uncertain"


@pytest.mark.asyncio
async def test_resolve_computes_kinds_for_legacy_components_from_source_url() -> None:
    legacy = {"ingredient_links": ["https://shop.test/x"], "ingredient_flags": [{"allergen": None}]}

    _, status = await linked_recipes.resolve_linked_allergens(FakeSession(), [legacy], "https://a.test/r")

    assert status == "analyzed"


@pytest.mark.asyncio
async def test_mark_link_external_updates_parent_and_rechecks(spawn_mocks) -> None:
    parent = _parent(["https://a.test/x/", "https://a.test/y"])
    session = FakeSession()
    session.get = AsyncMock(return_value=parent)

    await linked_recipes.mark_link_external(session, parent.id, "https://a.test/x")

    assert parent.components[0]["ingredient_link_kinds"] == ["external", "recipe"]
    spawn_mocks.enqueue.assert_awaited_once_with(session, parent.id)


@pytest.mark.asyncio
async def test_mark_link_external_ignores_unknown_url_and_missing_parent(spawn_mocks) -> None:
    parent = _parent(["https://a.test/x"])
    session = FakeSession()
    session.get = AsyncMock(return_value=parent)
    await linked_recipes.mark_link_external(session, parent.id, "https://a.test/other")
    session.get = AsyncMock(return_value=None)
    await linked_recipes.mark_link_external(session, parent.id, "https://a.test/x")

    spawn_mocks.enqueue.assert_not_awaited()


@pytest.mark.asyncio
async def test_route_rejects_external_link() -> None:
    parent = _recipe(components=[_component(["https://shop.test/x"], kinds=["external"])], source_url="https://a.test/r")
    session = FakeSession(scalar=parent)

    with pytest.raises(HTTPException) as error:
        await recipes_route.import_linked_recipe_route(
            parent.id, LinkedRecipeImportRequest(url="https://shop.test/x"),
            user=SimpleNamespace(id=uuid4()), session=session, household_id=uuid4(),
        )

    assert error.value.status_code == 422


def test_save_route_derives_kinds_server_side_and_keeps_confirmed_external() -> None:
    stored = _component(["https://a.test/x", "https://a.test/y"], kinds=["external", "recipe"])

    kinds = recipes_route._server_link_kinds(stored, ["https://a.test/x", "https://a.test/y", "https://shop.test/z"], "https://a.test/r")

    assert kinds == ["external", "recipe", "external"]


@pytest.mark.parametrize("link", [
    "https://own.test/rice", "https://own.test/rice/", "https://www.own.test/rice", "https://own.test/rice/#step-2",
])
def test_without_self_links_drops_variants_of_the_own_url_and_aligns_slots(link) -> None:
    component = _component([link, "https://own.test/other"], ids=[str(uuid4()), str(uuid4())], kinds=["recipe", "recipe"])

    cleaned = linked_recipes.without_self_links([component], "https://own.test/rice")[0]

    assert cleaned["ingredient_links"] == [None, "https://own.test/other"]
    assert cleaned["linked_recipe_ids"] == [None, component["linked_recipe_ids"][1]]
    assert cleaned["ingredient_link_kinds"] == [None, "recipe"]
    assert component["ingredient_links"][0] == link


def test_without_self_links_keeps_other_paths_and_queries() -> None:
    components = [_component(["https://own.test/rice-guide", "https://own.test/rice?v=2"])]

    assert linked_recipes.without_self_links(components, "https://own.test/rice") == components


def test_link_kinds_and_linked_urls_ignore_self_links_in_legacy_data() -> None:
    component = _component(["https://own.test/rice", "https://own.test/other"], kinds=["recipe", "recipe"])

    assert linked_recipes.link_kinds(component, "https://own.test/rice/") == [None, "recipe"]
    assert linked_recipes.linked_urls([component], "https://own.test/rice") == ["https://own.test/other"]


@pytest.mark.asyncio
async def test_resolve_treats_a_self_link_as_an_ordinary_ingredient() -> None:
    components = [_component(["https://own.test/rice"], flags=[{"allergen": "soy", "linked_allergens": ["old"]}])]

    resolved, status = await linked_recipes.resolve_linked_allergens(FakeSession(), components, "https://own.test/rice")

    assert status == "analyzed"
    assert resolved[0]["ingredient_flags"][0]["linked_allergens"] is None
    assert linked_recipes.recipe_allergens(resolved) == ["soy"]
