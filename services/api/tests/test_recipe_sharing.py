import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from api.routes import recipes


@pytest.mark.asyncio
async def test_link_recipe_to_personal_marks_household_recipe_as_shared(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recipe = SimpleNamespace(shared_to_personal=False)
    result = Mock()
    result.scalar_one_or_none.return_value = recipe
    session = SimpleNamespace(execute=AsyncMock(return_value=result), commit=AsyncMock(), refresh=AsyncMock())
    expected = SimpleNamespace(id=uuid.uuid4())
    monkeypatch.setattr(recipes, "_build_recipe_out", lambda _: expected)

    response = await recipes.link_recipe_to_personal(
        uuid.uuid4(),
        SimpleNamespace(id=uuid.uuid4()),
        session,
        uuid.uuid4(),
    )

    assert response is expected
    assert recipe.shared_to_personal is True
    session.commit.assert_awaited_once()
    session.refresh.assert_awaited_once_with(recipe)


@pytest.mark.asyncio
async def test_link_recipe_to_personal_requires_household_context() -> None:
    with pytest.raises(HTTPException, match="Not in a household context") as exc_info:
        await recipes.link_recipe_to_personal(
            uuid.uuid4(),
            SimpleNamespace(id=uuid.uuid4()),
            SimpleNamespace(),
            None,
        )

    assert exc_info.value.status_code == 400
