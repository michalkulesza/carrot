from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from api.models import AllergenFlag
from api.services import allergen_rechecks, linked_recipes


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


def _component(links, ids=None, flags=None):
    return {
        "ingredients": [f"item {index}" for index, _ in enumerate(links)],
        "ingredient_links": links, "linked_recipe_ids": ids or [None] * len(links),
        "ingredient_flags": flags if flags is not None else [{"allergen": None} for _ in links],
    }


def test_normalize_link_ignores_fragment_trailing_slash_and_host_case() -> None:
    assert linked_recipes.normalize_link("HTTPS://Example.com/Sauce/#top") == "https://example.com/Sauce"
    assert linked_recipes.normalize_link("https://example.com/sauce?x=1") == "https://example.com/sauce?x=1"
    assert linked_recipes.normalize_link("mailto:a@b.c") is None
    assert linked_recipes.normalize_link(None) is None


def test_linked_urls_dedupes_skips_own_url_and_caps() -> None:
    components = [
        _component(["https://a.test/x", "https://A.test/x/", None, "https://own.test/r", "ftp://a.test/y"]),
        _component([f"https://b.test/{index}" for index in range(10)]),
    ]

    urls = linked_recipes.linked_urls(components, "https://own.test/r/#c")

    assert urls == ["https://a.test/x"] + [f"https://b.test/{index}" for index in range(4)]


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
    return _recipe(components=[_component(links)], source_url="https://own.test/r")


def _job(parent_recipe_id=None):
    return SimpleNamespace(user_id=uuid4(), household_id=uuid4(), parent_recipe_id=parent_recipe_id)


@pytest.mark.asyncio
async def test_spawn_is_skipped_for_child_jobs(spawn_mocks) -> None:
    session = FakeSession()

    await linked_recipes.spawn_linked_imports(session, _parent(["https://a.test/x"]), _job(uuid4()))

    session.scalar.assert_not_awaited()
    spawn_mocks.existing.assert_not_awaited()


@pytest.mark.asyncio
async def test_spawn_queues_one_job_per_unique_url(spawn_mocks) -> None:
    session = FakeSession(scalar=uuid4())
    session.get = AsyncMock()

    await linked_recipes.spawn_linked_imports(
        session, _parent(["https://a.test/x", "https://a.test/x/", "https://own.test/r", "https://b.test/y"]), _job(),
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
    parent = _parent(["https://a.test/x", "https://b.test/y"])

    await linked_recipes.spawn_linked_imports(session, parent, _job())

    assert parent.components[0]["linked_recipe_ids"] == [str(existing_id), None]
    spawn_mocks.related.assert_awaited_once()
    spawn_mocks.enqueue.assert_awaited_once_with(session, parent.id)
    assert session.scalar.await_count == 1


@pytest.mark.asyncio
async def test_duplicate_child_job_conflict_emits_no_event(spawn_mocks) -> None:
    session = FakeSession(scalar=None)

    await linked_recipes.spawn_linked_imports(session, _parent(["https://a.test/x"]), _job())

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
