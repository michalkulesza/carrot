import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from api.routes.meal_plan import (
    _apply_move,
    _next_entry_statement,
    _parse_date,
    get_next_meal_plan_entry,
    router,
)
from api.models import MealPlanMoveRequest, MealPlanSetRequest


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
    assert "ORDER BY meal_plan_entries.date ASC" in sql
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


def test_apply_move_to_empty_target_reassigns_date() -> None:
    source = SimpleNamespace(date=date(2026, 7, 1), recipe_id=uuid.uuid4(), recipe="pasta", text=None)

    result = _apply_move(source, None, date(2026, 7, 5))

    assert result == [source]
    assert source.date == date(2026, 7, 5)


def test_apply_move_to_occupied_target_swaps_payload_not_dates() -> None:
    recipe_id_a, recipe_id_b = uuid.uuid4(), uuid.uuid4()
    source = SimpleNamespace(date=date(2026, 7, 1), recipe_id=recipe_id_a, recipe="pasta", text=None)
    target = SimpleNamespace(date=date(2026, 7, 5), recipe_id=recipe_id_b, recipe="soup", text=None)

    result = _apply_move(source, target, date(2026, 7, 5))

    assert result == [source, target]
    assert source.date == date(2026, 7, 1)
    assert target.date == date(2026, 7, 5)
    assert source.recipe_id == recipe_id_b
    assert source.recipe == "soup"
    assert target.recipe_id == recipe_id_a
    assert target.recipe == "pasta"


def test_apply_move_swapping_recipe_and_text_entries_clears_stale_field() -> None:
    recipe_id = uuid.uuid4()
    source = SimpleNamespace(date=date(2026, 7, 1), recipe_id=recipe_id, recipe="pasta", text=None)
    target = SimpleNamespace(date=date(2026, 7, 5), recipe_id=None, recipe=None, text="Frozen pizza")

    _apply_move(source, target, date(2026, 7, 5))

    assert source.recipe_id is None
    assert source.recipe is None
    assert source.text == "Frozen pizza"
    assert target.recipe_id == recipe_id
    assert target.recipe == "pasta"
    assert target.text is None


def test_meal_plan_move_request_rejects_malformed_to() -> None:
    with pytest.raises(ValueError):
        MealPlanMoveRequest(to="   ")


def test_move_route_exists_and_is_post() -> None:
    route = next(route for route in router.routes if route.path == "/meal-plan/{date_str}/move")

    assert route.methods == {"POST"}
