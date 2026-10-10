from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from api.models import ImportMetadata, ImportResult, ImportStage, RecipeComponent, RecipeExtraction
from api.services import import_worker
from api.services.text_sanitizing import sanitize_recipe, sanitize_text, sanitize_value, sanitized_fields


def test_sanitize_text_strips_control_characters_and_lone_surrogates() -> None:
    assert sanitize_text("saut\u0000e\x07d\x9f\ud800 ok") == "sauted ok"


def test_sanitize_text_keeps_whitespace_emoji_and_polish_characters() -> None:
    value = "zupa\n\tżółć\r\n🥕 ćwikła"

    assert sanitize_text(value) == value


def test_sanitize_value_cleans_nested_structures_and_keeps_other_types() -> None:
    value = {"name": "a\x00", "steps": ["b\x07", {"note": "c\x9f"}], "count": 3, "link": None}

    assert sanitize_value(value) == {"name": "a", "steps": ["b", {"note": "c"}], "count": 3, "link": None}


def _recipe(**overrides):
    fields = dict(title="Soup", source_title=None, overview=None, notes=None, creator_handle=None, components=[])
    return SimpleNamespace(**{**fields, "title": "Soup", **overrides})


def test_sanitized_fields_reports_only_changed_fields_without_mutating() -> None:
    recipe = _recipe(title="So\x00up", components=[{"steps": ["saut\x00"]}])

    changes = sanitized_fields(recipe)

    assert changes == {"title": "Soup", "components": [{"steps": ["saut"]}]}
    assert recipe.title == "So\x00up"


def test_sanitize_recipe_cleans_text_fields_and_components_in_place() -> None:
    recipe = _recipe(notes="n\x00", creator_handle="@c\x07", overview="o", components=[{"name": "x\x9f"}])

    sanitize_recipe(recipe)

    assert (recipe.notes, recipe.creator_handle, recipe.overview, recipe.components) == ("n", "@c", "o", [{"name": "x"}])


@pytest.mark.asyncio
async def test_worker_save_drops_self_links_and_strips_control_characters(monkeypatch) -> None:
    session = SimpleNamespace(add=Mock(), flush=AsyncMock(), get=AsyncMock(return_value=None))
    for name in ("_archive_thumbnail", "_link_recipe_to_household", "queue_recipe_embedding"):
        monkeypatch.setattr(import_worker, name, AsyncMock())
    extraction = RecipeExtraction(
        title="Rice\x00",
        components=[RecipeComponent(
            role="step_list", steps=["saut\x00e"], ingredients=[],
            ingredient_links=["https://www.own.test/rice/#step", "https://own.test/other"],
        )],
    )
    result = ImportResult(
        stage=ImportStage.DESCRIPTION, recipe=extraction, metadata=ImportMetadata(source_url="https://own.test/rice/"),
    )

    recipe = await import_worker._save_recipe(session, SimpleNamespace(user_id=uuid4(), household_id=None), result)

    assert recipe.title == "Rice"
    assert recipe.components[0]["steps"] == ["saute"]
    assert recipe.components[0]["ingredient_links"] == [None, "https://own.test/other"]
    assert recipe.components[0]["ingredient_link_kinds"] == [None, "recipe"]
