import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from api.routes import meal_plan as meal_plan_routes
from api.routes.meal_plan import (
    _dish_key,
    _move_entries,
    _next_entry_statement,
    _parse_date,
    add_meal_plan_entries,
    delete_meal_plan_entry,
    delete_meal_plan_entry_by_id,
    get_next_meal_plan_entry,
    move_meal_plan_entry,
    move_meal_plan_entry_by_id,
    router,
    set_meal_plan_entry,
)
from api.models import MealPlanAddRequest, MealPlanMoveRequest, MealPlanSetRequest


@pytest.mark.parametrize(
    "value",
    ["20260714", "2026-7-14", "2026-02-30", "not-a-date"],
)
def test_parse_date_rejects_invalid_values(value: str) -> None:
    with pytest.raises(HTTPException) as exc_info:
        _parse_date(value)

    assert exc_info.value.status_code == 400


def test_next_entry_route_exposes_from_query_parameter() -> None:
    route = next(route for route in router.routes if route.path == "/meal-plan/next")

    assert [parameter.alias for parameter in route.dependant.query_params] == ["from"]


def test_plain_text_entry_is_trimmed() -> None:
    entry = MealPlanSetRequest(text="  Frozen pizza  ")

    assert entry.recipe_id is None
    assert entry.text == "Frozen pizza"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"text": "   "},
        {"text": "x" * 201},
        {"recipe_id": uuid.uuid4(), "text": "Frozen pizza"},
    ],
)
def test_meal_plan_entry_requires_exactly_one_source(payload: dict) -> None:
    with pytest.raises(ValueError):
        MealPlanSetRequest(**payload)


def test_next_household_entry_query_is_isolated_and_has_unlimited_look_ahead() -> None:
    statement = _next_entry_statement(uuid.uuid4(), date(2026, 12, 31))
    sql = str(statement.compile(dialect=postgresql.dialect()))

    assert "meal_plan_entries.household_id =" in sql
    assert "meal_plan_entries.user_id =" not in sql
    assert "meal_plan_entries.date >=" in sql
    assert "meal_plan_entries.date <=" not in sql
    assert "ORDER BY meal_plan_entries.date, meal_plan_entries.created_at, meal_plan_entries.id" in sql
    assert "LIMIT" in sql


@pytest.mark.asyncio
async def test_next_entry_returns_null_when_no_upcoming_meal_exists() -> None:
    result = Mock()
    result.scalar_one_or_none.return_value = None
    session = SimpleNamespace(execute=AsyncMock(return_value=result))
    user = SimpleNamespace(id=uuid.uuid4())

    response = await get_next_meal_plan_entry("2026-07-14", user, session, None)

    assert response is None
    session.execute.assert_awaited_once()


def test_meal_plan_move_request_rejects_malformed_to() -> None:
    with pytest.raises(ValueError):
        MealPlanMoveRequest(to="   ")


def test_move_route_exists_and_is_post() -> None:
    route = next(route for route in router.routes if route.path == "/meal-plan/{date_str}/move")

    assert route.methods == {"POST"}


HOUSEHOLD_ID = uuid.uuid4()


def _entry(day: date, recipe_id: uuid.UUID | None = None, text: str | None = None, seq: int = 0):
    return SimpleNamespace(
        id=uuid.uuid4(),
        household_id=HOUSEHOLD_ID,
        date=day,
        recipe_id=recipe_id,
        recipe=SimpleNamespace(id=recipe_id) if recipe_id else None,
        text=text,
        created_at=seq,
    )


class FakeSession:
    def __init__(self, entries: list) -> None:
        self.entries = entries
        self.commits = 0

    def add(self, entry) -> None:
        entry.id = uuid.uuid4()
        self.entries.append(entry)

    async def delete(self, entry) -> None:
        self.entries.remove(entry)

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, entry) -> None:
        return None

    async def execute(self, statement):
        entry_id = statement.compile().params.get("id_1")
        match = next((e for e in self.entries if e.id == entry_id), None)
        result = Mock()
        result.scalar_one_or_none.return_value = match
        return result


@pytest.fixture
def fake_env(monkeypatch):
    recipe_ids: set[uuid.UUID] = set()

    async def entries_on(session, household_id, day):
        found = [e for e in session.entries if e.date == day]
        return sorted(found, key=lambda e: e.created_at)

    async def require_recipes(session, household_id, ids):
        missing = [i for i in ids if i not in recipe_ids]
        if missing:
            raise HTTPException(status_code=404, detail="Recipe not found")
        return {i: SimpleNamespace(id=i) for i in ids}

    publish = AsyncMock()
    monkeypatch.setattr(meal_plan_routes, "_entries_on", entries_on)
    monkeypatch.setattr(meal_plan_routes, "_require_accessible_recipes", require_recipes)
    monkeypatch.setattr(meal_plan_routes.broadcaster, "publish", publish)
    monkeypatch.setattr(meal_plan_routes, "MealPlanEntryOut", SimpleNamespace(model_validate=lambda entry: entry))
    return SimpleNamespace(recipe_ids=recipe_ids, publish=publish, user=SimpleNamespace(id=uuid.uuid4()))


def _item(**kwargs):
    return {"recipe_id": kwargs.get("recipe_id"), "text": kwargs.get("text")}


@pytest.mark.asyncio
async def test_add_entries_allows_several_dishes_and_is_idempotent(fake_env) -> None:
    recipe_a, recipe_b = uuid.uuid4(), uuid.uuid4()
    fake_env.recipe_ids.update({recipe_a, recipe_b})
    session = FakeSession([])
    body = MealPlanAddRequest(
        items=[_item(recipe_id=recipe_a), _item(recipe_id=recipe_b), _item(text="Pizza"), _item(text=" pizza ")]
    )

    first = await add_meal_plan_entries("2026-07-14", body, fake_env.user, session, HOUSEHOLD_ID)
    second = await add_meal_plan_entries("2026-07-14", body, fake_env.user, session, HOUSEHOLD_ID)

    assert len(session.entries) == 3
    assert len(first) == 3
    assert [e.id for e in second] == [e.id for e in first]
    assert fake_env.publish.await_count == 1


@pytest.mark.asyncio
async def test_add_entries_rejects_inaccessible_recipe(fake_env) -> None:
    session = FakeSession([])
    body = MealPlanAddRequest(items=[_item(recipe_id=uuid.uuid4())])

    with pytest.raises(HTTPException) as exc_info:
        await add_meal_plan_entries("2026-07-14", body, fake_env.user, session, HOUSEHOLD_ID)

    assert exc_info.value.status_code == 404
    assert session.entries == []


def test_add_request_limits_item_count() -> None:
    with pytest.raises(ValueError):
        MealPlanAddRequest(items=[])
    with pytest.raises(ValueError):
        MealPlanAddRequest(items=[_item(text=f"m{i}") for i in range(21)])


@pytest.mark.asyncio
async def test_delete_by_id_twice_is_204_both_times(fake_env) -> None:
    entry = _entry(date(2026, 7, 14), text="Pizza")
    session = FakeSession([entry])

    await delete_meal_plan_entry_by_id(entry.id, fake_env.user, session, HOUSEHOLD_ID)
    await delete_meal_plan_entry_by_id(entry.id, fake_env.user, session, HOUSEHOLD_ID)

    assert session.entries == []
    assert fake_env.publish.await_count == 1


@pytest.mark.asyncio
async def test_move_by_id_to_empty_day_changes_date(fake_env) -> None:
    entry = _entry(date(2026, 7, 14), text="Pizza")
    session = FakeSession([entry])
    body = MealPlanMoveRequest(to="2026-07-16")

    moved = await move_meal_plan_entry_by_id(entry.id, body, fake_env.user, session, HOUSEHOLD_ID)

    assert entry.date == date(2026, 7, 16)
    assert moved.id == entry.id


@pytest.mark.asyncio
async def test_move_by_id_dedupes_on_target(fake_env) -> None:
    recipe_id = uuid.uuid4()
    source = _entry(date(2026, 7, 14), recipe_id=recipe_id)
    existing = _entry(date(2026, 7, 16), recipe_id=recipe_id)
    other = _entry(date(2026, 7, 16), text="Soup", seq=1)
    session = FakeSession([source, existing, other])
    body = MealPlanMoveRequest(to="2026-07-16")

    moved = await move_meal_plan_entry_by_id(source.id, body, fake_env.user, session, HOUSEHOLD_ID)

    assert moved.id == existing.id
    assert source not in session.entries
    assert len(session.entries) == 2


@pytest.mark.asyncio
async def test_move_by_id_missing_entry_is_404(fake_env) -> None:
    session = FakeSession([])

    with pytest.raises(HTTPException) as exc_info:
        await move_meal_plan_entry_by_id(
            uuid.uuid4(), MealPlanMoveRequest(to="2026-07-16"), fake_env.user, session, HOUSEHOLD_ID
        )

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_legacy_put_replaces_all_entries_on_the_date(fake_env) -> None:
    day = date(2026, 7, 14)
    session = FakeSession([_entry(day, text="A"), _entry(day, text="B", seq=1), _entry(date(2026, 7, 15), text="C")])

    result = await set_meal_plan_entry(
        "2026-07-14", MealPlanSetRequest(text="Only"), fake_env.user, session, HOUSEHOLD_ID
    )

    on_day = [e for e in session.entries if e.date == day]
    assert len(on_day) == 1
    assert result.text == "Only"
    assert len(session.entries) == 2


@pytest.mark.asyncio
async def test_legacy_delete_removes_all_entries_on_the_date(fake_env) -> None:
    day = date(2026, 7, 14)
    session = FakeSession([_entry(day, text="A"), _entry(day, text="B", seq=1), _entry(date(2026, 7, 15), text="C")])

    await delete_meal_plan_entry("2026-07-14", fake_env.user, session, HOUSEHOLD_ID)

    assert [e.text for e in session.entries] == ["C"]


@pytest.mark.asyncio
async def test_legacy_move_moves_all_entries_and_dedupes(fake_env) -> None:
    src, dst = date(2026, 7, 14), date(2026, 7, 16)
    session = FakeSession([_entry(src, text="A"), _entry(src, text="B", seq=1), _entry(dst, text="a")])

    moved = await move_meal_plan_entry(
        "2026-07-14", MealPlanMoveRequest(to="2026-07-16"), fake_env.user, session, HOUSEHOLD_ID
    )

    assert len(moved) == 2
    assert all(e.date == dst for e in session.entries)
    assert len(session.entries) == 2


@pytest.mark.asyncio
async def test_move_entries_preserves_order_of_resulting_list(fake_env) -> None:
    src, dst = date(2026, 7, 14), date(2026, 7, 16)
    a, b = _entry(src, text="A"), _entry(src, text="B", seq=1)
    session = FakeSession([a, b])

    result = await _move_entries(session, HOUSEHOLD_ID, [a, b], dst)

    assert result == [a, b]


def test_dish_key_normalises_text() -> None:
    assert _dish_key(None, " Pizza ") == _dish_key(None, "pizza")
    recipe_id = uuid.uuid4()
    assert _dish_key(recipe_id, None) != _dish_key(None, str(recipe_id))


def test_entry_routes_are_not_shadowed_by_date_routes() -> None:
    paths = [(route.path, tuple(sorted(route.methods))) for route in router.routes]

    assert paths.index(("/meal-plan/entries/{entry_id}", ("DELETE",))) < paths.index(("/meal-plan/{date_str}", ("DELETE",)))
    assert paths.index(("/meal-plan/entries/{entry_id}/move", ("POST",))) < paths.index(("/meal-plan/{date_str}/move", ("POST",)))
