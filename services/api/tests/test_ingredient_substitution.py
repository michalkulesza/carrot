from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, Mock
from uuid import uuid4

import pytest

from api.models import AllergenFlag, ImportMetadata, ImportResult, RecipeExtraction
from api.services import import_worker
from api.services.allergen_rechecks import _analysis_ingredients
from api.services.recipe_components import serialize_components


def extraction():
    return RecipeExtraction.model_validate({
        "title": "Spread",
        "components": [{
            "ingredients": [
                {"qty": "100", "unit": "g", "name": "peanut butter",
                 "shopping_list_value": "100 g peanut butter", "allergen": "peanuts",
                 "substitute": "60 g tahini"},
                {"qty": "1", "name": "banana"},
            ],
            "metric_ingredients": ["100 g peanut butter", "1 banana"],
            "imperial_ingredients": ["3.5 oz peanut butter", "1 banana"],
            "steps": ["Mix the ingredients."],
            "step_ingredient_line": [0],
        }],
    })


@pytest.mark.asyncio
@pytest.mark.parametrize("enabled", [False, True])
async def test_import_saves_replacement_consistently_and_keeps_restore_data(monkeypatch, enabled):
    session = SimpleNamespace(
        get=AsyncMock(return_value=SimpleNamespace(auto_substitute=enabled)),
        add=Mock(), flush=AsyncMock(),
    )
    for name in ("_archive_thumbnail", "_link_recipe_to_household", "queue_recipe_embedding"):
        monkeypatch.setattr(import_worker, name, AsyncMock())
    recipe = await import_worker._save_recipe(
        session, SimpleNamespace(user_id=uuid4(), household_id=None),
        ImportResult(stage="transcript", recipe=extraction(), metadata=ImportMetadata()),
    )
    component = recipe.components[0]
    expected = "60 g tahini" if enabled else "100 g peanut butter"
    for field in ("ingredients", "shopping_list_ingredients", "metric_ingredients"):
        assert component[field] == [expected, "1 banana"]
    assert component["imperial_ingredients"] == ["60 g tahini" if enabled else "3.5 oz peanut butter", "1 banana"]
    flag = AllergenFlag.model_validate(component["ingredient_flags"][0])
    assert flag.substitute_applied is enabled
    assert flag.substitute == "60 g tahini"
    assert flag.original_display == ("100 g peanut butter" if enabled else None)
    if enabled:
        assert flag.model_dump()["original_values"] == {
            "shopping_list_ingredients": "100 g peanut butter",
            "metric_ingredients": "100 g peanut butter",
            "imperial_ingredients": "3.5 oz peanut butter",
        }
    assert _analysis_ingredients(component) == ["100 g peanut butter", "1 banana"]
    assert component["step_ingredient_line"] == [0]


def test_substitution_handles_absent_unit_variants_and_missing_alternatives():
    source = extraction()
    source.components[0].metric_ingredients = []
    source.components[0].imperial_ingredients = []
    component = serialize_components(source, True)[0]
    assert component["metric_ingredients"] == ["60 g tahini", "1 banana"]
    assert component["ingredient_flags"][1]["substitute_applied"] is False
    assert source.components[0].ingredients[0].name == "peanut butter"


def test_reimport_uses_the_same_substitution_serialization():
    import importlib.util
    from pathlib import Path
    from api.models import Recipe

    spec = importlib.util.spec_from_file_location("reimport_script", Path(__file__).parents[1] / "scripts/reimport_recipes.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    recipe = Recipe(title="Original")
    module.apply_extraction(recipe, ImportResult(stage="transcript", recipe=extraction(), metadata=ImportMetadata()), True)
    assert recipe.components == serialize_components(extraction(), True)


@pytest.mark.asyncio
async def test_allergen_recheck_preserves_auto_applied_original_values(monkeypatch):
    from api.services import allergen_rechecks

    recipe = SimpleNamespace(components=serialize_components(extraction(), True), allergen_status="analyzed")
    originals = recipe.components[0]["ingredient_flags"][0]["original_values"].copy()
    job = SimpleNamespace(revision=1)
    read = SimpleNamespace(get=AsyncMock(return_value=recipe))
    write = SimpleNamespace(get=AsyncMock(return_value=recipe), scalar=AsyncMock(return_value=job), commit=AsyncMock())
    contexts = []
    for session in (read, write):
        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=session)
        context.__aexit__ = AsyncMock(return_value=False)
        contexts.append(context)
    monkeypatch.setattr(allergen_rechecks, "async_session_maker", Mock(side_effect=contexts))
    monkeypatch.setattr(allergen_rechecks, "_allergens_for_recipe", AsyncMock(return_value=["peanuts"]))
    monkeypatch.setattr(allergen_rechecks, "_publish_recipe_changed", AsyncMock())
    if hasattr(allergen_rechecks, "linked_recipes"):
        async def resolve(_session, components):
            return components, "analyzed"
        monkeypatch.setattr(allergen_rechecks.linked_recipes, "resolve_linked_allergens", resolve)
    analyze = AsyncMock(return_value=[AllergenFlag(allergen="peanuts", substitute="60 g tahini"), AllergenFlag()])
    monkeypatch.setattr(allergen_rechecks.gemini_svc, "analyze_allergens", analyze)

    await allergen_rechecks._process(uuid4(), 1)

    analyze.assert_awaited_once_with(["100 g peanut butter", "1 banana"], ["peanuts"])
    flag = AllergenFlag.model_validate(recipe.components[0]["ingredient_flags"][0])
    assert job.status == "succeeded"
    assert flag.original_values == originals
    assert flag.original_display == "100 g peanut butter"
    assert flag.substitute_applied is True
