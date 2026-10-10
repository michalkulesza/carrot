import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


reimport = _load("reimport_recipes")
backfill = _load("link_component_recipes")


def _recipe(links, ids=None, author_id=None):
    site = next((link.split("/")[2] for link in links if link), "own.test")
    return SimpleNamespace(
        id=uuid4(), title="Wraps", author_id=author_id or uuid4(), source_url=f"https://{site}/r",
        components=[{"ingredient_links": links, "linked_recipe_ids": ids or [None] * len(links)}],
    )


class ScalarRows(list):
    def all(self):
        return list(self)


class FakeSession:
    def __init__(self, recipes=None, scalars=()) -> None:
        self.recipes = recipes or {}
        self.scalars = AsyncMock(return_value=ScalarRows(scalars))
        self.get = AsyncMock(side_effect=lambda _model, key: self.recipes.get(key))
        self.commit = AsyncMock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None


@pytest.fixture
def link_mocks(monkeypatch):
    mocks = SimpleNamespace(
        spawn=AsyncMock(return_value=[uuid4()]), enqueue=AsyncMock(), component=AsyncMock(return_value=False),
        household=AsyncMock(return_value=uuid4()), existing=AsyncMock(return_value={}),
    )
    for module in (reimport, backfill):
        monkeypatch.setattr(module, "spawn_linked_imports", mocks.spawn)
        monkeypatch.setattr(module, "is_component_recipe", mocks.component)
        monkeypatch.setattr(module, "linking_household_id", mocks.household)
    monkeypatch.setattr(reimport.allergen_rechecks, "enqueue_recipe_allergen_check", mocks.enqueue)
    monkeypatch.setattr(backfill, "_household_recipes_by_url", mocks.existing)
    return mocks


@pytest.mark.asyncio
async def test_reimport_restores_surviving_links_and_spawns_for_the_rest(link_mocks) -> None:
    kept, deleted = uuid4(), uuid4()
    recipe = _recipe(["https://a.test/x", "https://b.test/y"])
    session = FakeSession(scalars=[kept])

    await reimport._restore_links_and_spawn(
        session, recipe, {"https://a.test/x": kept, "https://b.test/y": deleted},
    )

    assert recipe.components[0]["linked_recipe_ids"] == [str(kept), None]
    link_mocks.spawn.assert_awaited_once()
    link_mocks.enqueue.assert_awaited_once_with(session, recipe.id)


@pytest.mark.asyncio
async def test_reimport_skips_spawning_for_component_recipes_and_missing_household(link_mocks) -> None:
    recipe = _recipe(["https://a.test/x"])

    link_mocks.component.return_value = True
    await reimport._restore_links_and_spawn(FakeSession(), recipe, {})
    link_mocks.component.return_value = False
    link_mocks.household.return_value = None
    await reimport._restore_links_and_spawn(FakeSession(), recipe, {})

    link_mocks.spawn.assert_not_awaited()


@pytest.mark.asyncio
async def test_reimport_ignores_recipes_without_links(link_mocks) -> None:
    await reimport._restore_links_and_spawn(FakeSession(), _recipe([]), {})

    link_mocks.spawn.assert_not_awaited()


def _patch_backfill_sessions(monkeypatch, recipes):
    sessions = []

    def make_session():
        session = FakeSession({recipe.id: recipe for recipe in recipes}, scalars=[recipe.id for recipe in recipes])
        sessions.append(session)
        return session

    monkeypatch.setattr(backfill, "async_session_maker", make_session)
    return sessions


@pytest.mark.asyncio
async def test_backfill_dry_run_writes_nothing(link_mocks, monkeypatch) -> None:
    sessions = _patch_backfill_sessions(monkeypatch, [_recipe(["https://a.test/x"])])

    await backfill.main(apply=False, recipe_ids=set())

    link_mocks.spawn.assert_not_awaited()
    assert all(session.commit.await_count == 0 for session in sessions)


@pytest.mark.asyncio
async def test_backfill_apply_spawns_skips_components_and_is_idempotent(link_mocks, monkeypatch) -> None:
    normal, component, resolved = _recipe(["https://a.test/x"]), _recipe(["https://b.test/y"]), _recipe(["https://c.test/z"], [str(uuid4())])
    _patch_backfill_sessions(monkeypatch, [normal, component, resolved])
    link_mocks.component.side_effect = lambda _session, recipe: recipe is component

    await backfill.main(apply=True, recipe_ids=set())

    link_mocks.spawn.assert_awaited_once()
    assert link_mocks.spawn.await_args.args[1] is normal

    link_mocks.spawn.reset_mock(return_value=False)
    link_mocks.spawn.return_value = []
    await backfill.main(apply=True, recipe_ids=set())
    assert link_mocks.spawn.await_args.args[1] is normal


def test_has_unresolved_link_detects_null_slots() -> None:
    assert backfill.has_unresolved_link(_recipe(["https://a.test/x", None], [str(uuid4()), None])) is False
    assert backfill.has_unresolved_link(_recipe(["https://a.test/x"])) is True


def _kind_recipe():
    recipe = _recipe(["https://own.test/a", "https://shop.test/b"])
    recipe.source_url = "https://own.test/r"
    return recipe


@pytest.mark.asyncio
async def test_refresh_link_kinds_dry_run_writes_nothing(link_mocks, monkeypatch) -> None:
    recipe = _kind_recipe()
    sessions = _patch_backfill_sessions(monkeypatch, [recipe])
    monkeypatch.setattr(backfill.allergen_rechecks, "enqueue_recipe_allergen_check", link_mocks.enqueue)
    monkeypatch.setattr(backfill, "_failed_non_recipe_urls", AsyncMock(return_value=set()))

    await backfill.main(apply=False, recipe_ids=set(), refresh_kinds=True)

    assert "ingredient_link_kinds" not in recipe.components[0]
    link_mocks.enqueue.assert_not_awaited()
    assert all(session.commit.await_count == 0 for session in sessions)


@pytest.mark.asyncio
async def test_refresh_link_kinds_apply_writes_kinds_marks_failed_children_and_rechecks(link_mocks, monkeypatch) -> None:
    recipe = _kind_recipe()
    sessions = _patch_backfill_sessions(monkeypatch, [recipe])
    monkeypatch.setattr(backfill.allergen_rechecks, "enqueue_recipe_allergen_check", link_mocks.enqueue)
    monkeypatch.setattr(backfill, "_failed_non_recipe_urls", AsyncMock(return_value={"https://own.test/a"}))

    await backfill.main(apply=True, recipe_ids=set(), refresh_kinds=True)

    assert recipe.components[0]["ingredient_link_kinds"] == ["external", "external"]
    link_mocks.enqueue.assert_awaited_once()
    assert any(session.commit.await_count == 1 for session in sessions)

    link_mocks.enqueue.reset_mock()
    await backfill.main(apply=True, recipe_ids=set(), refresh_kinds=True)
    link_mocks.enqueue.assert_not_awaited()


def _dirty_recipe():
    recipe = _recipe(["https://own.test/r/#x", "https://own.test/a"])
    recipe.source_url = "https://own.test/r"
    recipe.title = "Rice\x00"
    recipe.components[0]["steps"] = ["saut\x00"]
    for field in ("source_title", "overview", "notes", "creator_handle"):
        setattr(recipe, field, None)
    return recipe


@pytest.mark.asyncio
async def test_clean_dry_run_writes_nothing(link_mocks, monkeypatch) -> None:
    recipe = _dirty_recipe()
    sessions = _patch_backfill_sessions(monkeypatch, [recipe])
    monkeypatch.setattr(backfill.allergen_rechecks, "enqueue_recipe_allergen_check", link_mocks.enqueue)
    monkeypatch.setattr(backfill, "_failed_non_recipe_urls", AsyncMock(return_value=set()))

    await backfill.main(apply=False, recipe_ids=set(), clean=True)

    assert recipe.title == "Rice\x00"
    assert recipe.components[0]["ingredient_links"][0] == "https://own.test/r/#x"
    link_mocks.enqueue.assert_not_awaited()
    assert all(session.commit.await_count == 0 for session in sessions)


@pytest.mark.asyncio
async def test_clean_apply_writes_enqueues_recheck_and_is_idempotent(link_mocks, monkeypatch) -> None:
    recipe = _dirty_recipe()
    sessions = _patch_backfill_sessions(monkeypatch, [recipe])
    monkeypatch.setattr(backfill.allergen_rechecks, "enqueue_recipe_allergen_check", link_mocks.enqueue)
    monkeypatch.setattr(backfill, "_failed_non_recipe_urls", AsyncMock(return_value=set()))

    await backfill.main(apply=True, recipe_ids=set(), clean=True)

    assert recipe.title == "Rice"
    assert recipe.components[0]["steps"] == ["saut"]
    assert recipe.components[0]["ingredient_links"] == [None, "https://own.test/a"]
    assert recipe.components[0]["ingredient_link_kinds"] == [None, "recipe"]
    link_mocks.enqueue.assert_awaited_once()
    assert any(session.commit.await_count == 1 for session in sessions)

    link_mocks.enqueue.reset_mock()
    await backfill.main(apply=True, recipe_ids=set(), clean=True)
    link_mocks.enqueue.assert_not_awaited()
