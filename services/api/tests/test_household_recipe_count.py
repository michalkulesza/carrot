import uuid
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy.dialects import postgresql

from api.routes.households import _households_out, household_recipe_counts


def _household(name: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        name=name,
        color="#6366f1",
        created_at=datetime(2026, 1, 1),
        allergens=None,
        invite_code="ABC123",
    )


def _session_returning(rows: list[tuple[uuid.UUID, int]]) -> AsyncMock:
    result = Mock()
    result.all.return_value = rows
    session = AsyncMock()
    session.execute.return_value = result
    return session


@pytest.mark.asyncio
async def test_counts_are_grouped_in_a_single_query() -> None:
    first, second = _household("First"), _household("Second")
    session = _session_returning([(first.id, 92)])

    counts = await household_recipe_counts(session, [first.id, second.id])

    assert counts == {first.id: 92}
    assert session.execute.await_count == 1
    sql = str(session.execute.await_args.args[0].compile(dialect=postgresql.dialect()))
    assert "GROUP BY recipe_households.household_id" in sql
    assert "JOIN recipes ON recipes.id = recipe_households.recipe_id" in sql
    assert "import_jobs.result_recipe_id = recipes.id" in sql
    assert "awaiting_children" in sql.lower() or "import_jobs.status" in sql


@pytest.mark.asyncio
async def test_households_without_shared_recipes_report_zero() -> None:
    first, second = _household("First"), _household("Second")
    session = _session_returning([(first.id, 3)])

    out = await _households_out(session, [first, second])

    assert [(h.name, h.recipe_count) for h in out] == [("First", 3), ("Second", 0)]


@pytest.mark.asyncio
async def test_no_households_skips_the_query() -> None:
    session = _session_returning([])

    assert await _households_out(session, []) == []
    session.execute.assert_not_awaited()
