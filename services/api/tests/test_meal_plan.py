import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from api.routes.meal_plan import (
    _next_entry_statement,
    _parse_date,
    get_next_meal_plan_entry,
    router,
)
from api.models import MealPlanSetRequest


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


def test_next_personal_entry_query_excludes_past_and_other_contexts() -> None:
    statement = _next_entry_statement(uuid.uuid4(), None, date(2026, 7, 14))
    sql = str(statement.compile(dialect=postgresql.dialect()))

    assert "meal_plan_entries.user_id =" in sql
    assert "meal_plan_entries.household_id IS NULL" in sql
    assert "meal_plan_entries.date >=" in sql
    assert "ORDER BY meal_plan_entries.date ASC" in sql
    assert "LIMIT" in sql


def test_next_household_entry_query_is_isolated_and_has_unlimited_look_ahead() -> None:
    statement = _next_entry_statement(uuid.uuid4(), uuid.uuid4(), date(2026, 12, 31))
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
