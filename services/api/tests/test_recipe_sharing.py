import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from api.routes import recipes


@pytest.mark.asyncio
async def test_link_recipe_to_personal_links_household_recipe_for_this_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recipe_id = uuid.uuid4()
    recipe = SimpleNamespace(id=recipe_id, shared_to_personal=False)
    result = Mock()
    result.scalar_one_or_none.return_value = recipe
    session = SimpleNamespace(execute=AsyncMock(return_value=result), commit=AsyncMock(), refresh=AsyncMock())
    expected = SimpleNamespace(id=uuid.uuid4())
    build_recipe_out = Mock(return_value=expected)
    monkeypatch.setattr(recipes, "_build_recipe_out", build_recipe_out)
    user = SimpleNamespace(id=uuid.uuid4())

    response = await recipes.link_recipe_to_personal(
        recipe_id,
        user,
        session,
        uuid.uuid4(),
    )

    assert response is expected
    # A per-user link row is inserted rather than flipping a global flag, so
    # other household members can independently link the same recipe.
    assert session.execute.await_count == 2
    session.commit.assert_awaited_once()
    session.refresh.assert_awaited_once_with(recipe)
    build_recipe_out.assert_called_once_with(recipe, user.id, personal_link_ids={recipe_id})


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
