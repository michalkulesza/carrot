from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from api.models import RecipeServingPreferenceUpdate
from api.routes import preferences


@pytest.mark.asyncio
async def test_first_serving_override_creates_preferences_without_crashing(monkeypatch) -> None:
    session = MagicMock()
    session.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    monkeypatch.setattr(preferences.UserPreferencesOut, "model_validate", staticmethod(lambda prefs: prefs))

    prefs = await preferences.update_recipe_serving_preference(
        recipe_id="recipe-1",
        body=RecipeServingPreferenceUpdate(servings=4),
        user=SimpleNamespace(id=uuid4()),
        session=session,
    )

    assert prefs.recipe_serving_overrides == {"recipe-1": 4}
    session.add.assert_called_once_with(prefs)
