from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from api.routes.meal_plan import stream_meal_plan
from api.routes.recipes import stream_recipes


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", [stream_recipes, stream_meal_plan])
async def test_stream_releases_db_session_before_streaming(endpoint) -> None:
    session = AsyncMock()

    await endpoint(request=AsyncMock(), user=SimpleNamespace(id=uuid4()), session=session, household_id=uuid4())

    session.close.assert_awaited_once()
