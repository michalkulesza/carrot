import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from api.services import recipe_edit_locks as locks_module
from api.services.recipe_edit_locks import recipe_edit_locks
from api.models import RecipeSaveRequest
from api.routes import recipes
from api.routes.recipes import EditLockBody, update_edit_lock, update_recipe


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeSession:
    def __init__(self, recipe):
        self.recipe = recipe

    async def execute(self, _statement):
        return FakeResult(self.recipe)

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def refresh(self, _recipe):
        pass


def make_user(nickname: str):
    return SimpleNamespace(id=uuid.uuid4(), nickname=nickname, email=f"{nickname}@example.com")


def make_recipe(edit_version: int = 1):
    return SimpleNamespace(
        id=uuid.uuid4(),
        edit_version=edit_version,
        nutrition_provenance={},
        total_time_minutes=None,
        components=[],
        issue_codes=[],
        thumbnail_url=None,
        source_url=None,
        kcal_per_serving=None,
        protein_per_serving=None,
        fat_per_serving=None,
        carbs_per_serving=None,
    )


def save_request(**overrides) -> RecipeSaveRequest:
    return RecipeSaveRequest(title="Soup", components=[], **overrides)


@pytest.fixture(autouse=True)
def reset_locks():
    recipe_edit_locks.clear()
    yield
    recipe_edit_locks.clear()


@pytest.fixture
def patched_update(monkeypatch):
    async def noop(*_args, **_kwargs):
        pass

    async def publish(*_args, **_kwargs):
        pass

    monkeypatch.setattr(recipes, "_set_tags", noop)
    monkeypatch.setattr(recipes, "enqueue_recipe_allergen_check", noop)
    monkeypatch.setattr(recipes, "queue_recipe_embedding", noop)
    monkeypatch.setattr(recipes, "sanitize_recipe", lambda _recipe: None)
    monkeypatch.setattr(recipes.broadcaster, "publish", publish)
    monkeypatch.setattr(recipes, "_get_household_ids_map", lambda *_args: _empty_map())
    monkeypatch.setattr(recipes, "_build_recipe_out", lambda recipe, **_kwargs: recipe)


async def _empty_map():
    return {}


async def lock(recipe, user, action, client_id="phone"):
    await update_edit_lock(recipe.id, EditLockBody(action=action), client_id, user, FakeSession(recipe), uuid.uuid4())


async def put(recipe, user, body, client_id="phone"):
    return await update_recipe(recipe.id, body, client_id, user, FakeSession(recipe), uuid.uuid4())


def is_locked_for(recipe, user, client_id):
    return recipe_edit_locks.holder_other_than(recipe.id, user.id, client_id) is not None


@pytest.mark.asyncio
async def test_other_user_gets_locked_conflict_without_same_user():
    recipe, alice, bob = make_recipe(), make_user("alice"), make_user("bob")

    await lock(recipe, alice, "start")

    with pytest.raises(HTTPException) as error:
        await lock(recipe, bob, "start", client_id="web")
    assert error.value.status_code == 409
    assert error.value.detail == {"code": "recipe_locked", "editor": "alice", "same_user": False}


@pytest.mark.asyncio
async def test_same_user_other_client_gets_same_user_conflict():
    recipe, alice = make_recipe(), make_user("alice")

    await lock(recipe, alice, "start")

    with pytest.raises(HTTPException) as error:
        await lock(recipe, alice, "start", client_id="web")
    assert error.value.status_code == 409
    assert error.value.detail == {"code": "recipe_locked", "editor": "alice", "same_user": True}


@pytest.mark.asyncio
async def test_same_client_can_start_and_keepalive():
    recipe, alice = make_recipe(), make_user("alice")

    await lock(recipe, alice, "start")
    await lock(recipe, alice, "keepalive")

    assert is_locked_for(recipe, alice, "web")
    assert not is_locked_for(recipe, alice, "phone")


@pytest.mark.asyncio
async def test_stop_by_other_client_does_not_release():
    recipe, alice = make_recipe(), make_user("alice")

    await lock(recipe, alice, "start")
    await lock(recipe, alice, "stop", client_id="web")

    assert is_locked_for(recipe, alice, "web")


@pytest.mark.asyncio
async def test_stop_releases_lock_for_others():
    recipe, alice, bob = make_recipe(), make_user("alice"), make_user("bob")

    await lock(recipe, alice, "start")
    await lock(recipe, alice, "stop")
    await lock(recipe, alice, "stop")
    await lock(recipe, bob, "start", client_id="web")

    assert is_locked_for(recipe, alice, "phone")


@pytest.mark.asyncio
async def test_stop_keeps_lock_held_on_another_recipe():
    first, second, alice = make_recipe(), make_recipe(), make_user("alice")

    await lock(first, alice, "start")
    await lock(second, alice, "stop")

    assert is_locked_for(first, alice, "web")


@pytest.mark.asyncio
async def test_expired_lock_is_free(monkeypatch):
    recipe, alice = make_recipe(), make_user("alice")
    now = [1000.0]
    monkeypatch.setattr(locks_module.time, "monotonic", lambda: now[0])

    await lock(recipe, alice, "start")
    now[0] += locks_module.LOCK_TTL_SECONDS + 1

    await lock(recipe, alice, "start", client_id="web")

    assert is_locked_for(recipe, alice, "phone")


@pytest.mark.asyncio
async def test_missing_client_id_is_treated_as_distinct_client():
    recipe, alice = make_recipe(), make_user("alice")

    await lock(recipe, alice, "start")

    with pytest.raises(HTTPException) as error:
        await lock(recipe, alice, "start", client_id=None)
    assert error.value.detail["same_user"] is True


@pytest.mark.asyncio
async def test_lock_on_unknown_recipe_is_not_found():
    with pytest.raises(HTTPException) as error:
        await update_edit_lock(uuid.uuid4(), EditLockBody(action="start"), "phone", make_user("a"), FakeSession(None), uuid.uuid4())
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_put_blocked_while_another_user_holds_lock(patched_update):
    recipe, alice, bob = make_recipe(), make_user("alice"), make_user("bob")
    await lock(recipe, alice, "start")

    with pytest.raises(HTTPException) as error:
        await put(recipe, bob, save_request())

    assert error.value.status_code == 409
    assert error.value.detail == {"code": "recipe_locked", "editor": "alice", "same_user": False}
    assert recipe.edit_version == 1


@pytest.mark.asyncio
async def test_put_blocked_for_same_user_other_client(patched_update):
    recipe, alice = make_recipe(), make_user("alice")
    await lock(recipe, alice, "start")

    with pytest.raises(HTTPException) as error:
        await put(recipe, alice, save_request(), client_id="web")

    assert error.value.detail["same_user"] is True


@pytest.mark.asyncio
async def test_put_without_client_id_blocked_by_existing_lock(patched_update):
    recipe, alice = make_recipe(), make_user("alice")
    await lock(recipe, alice, "start")

    with pytest.raises(HTTPException) as error:
        await put(recipe, alice, save_request(), client_id=None)

    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_put_by_lock_holder_succeeds(patched_update):
    recipe, alice = make_recipe(), make_user("alice")
    await lock(recipe, alice, "start")

    await put(recipe, alice, save_request())

    assert recipe.edit_version == 2


@pytest.mark.asyncio
async def test_put_with_stale_version_conflicts(patched_update):
    recipe = make_recipe(edit_version=3)

    with pytest.raises(HTTPException) as error:
        await put(recipe, make_user("alice"), save_request(expected_edit_version=2))

    assert error.value.status_code == 409
    assert error.value.detail == {"code": "recipe_changed"}
    assert recipe.edit_version == 3


@pytest.mark.asyncio
async def test_put_with_current_version_increments(patched_update):
    recipe = make_recipe(edit_version=3)

    await put(recipe, make_user("alice"), save_request(expected_edit_version=3))

    assert recipe.edit_version == 4


@pytest.mark.asyncio
async def test_put_without_version_succeeds(patched_update):
    recipe = make_recipe()

    await put(recipe, make_user("alice"), save_request())

    assert recipe.edit_version == 2
