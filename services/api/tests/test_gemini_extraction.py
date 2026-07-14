import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from api.models import RecipeExtraction
from api.services import gemini, pipeline


def _response(payload: dict) -> SimpleNamespace:
    return SimpleNamespace(text=json.dumps(payload), usage_metadata=None)


def _extraction_payload() -> dict:
    return {
        "kcal_per_serving": 0,
        "protein_per_serving": 0,
        "fat_per_serving": 0,
        "carbs_per_serving": 0,
    }


@pytest.mark.asyncio
async def test_text_extraction_uses_configured_model_and_deterministic_sampling(monkeypatch) -> None:
    generate_content = Mock(return_value=_response(_extraction_payload()))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)
    monkeypatch.setattr(gemini.settings, "gemini_extraction_model", "configured-extraction-model")

    await gemini.extract_recipe("Ingredients: 1 onion")

    assert generate_content.call_args.kwargs["model"] == "configured-extraction-model"
    config = generate_content.call_args.kwargs["config"]
    assert config.temperature == 0
    assert "Never add an ingredient" in config.system_instruction


@pytest.mark.asyncio
async def test_image_extraction_uses_deterministic_sampling(monkeypatch) -> None:
    generate_content = Mock(return_value=_response(_extraction_payload()))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    await gemini.extract_recipe_from_image(b"image", mime_type="image/jpeg", model="image-model")

    assert generate_content.call_args.kwargs["model"] == "image-model"
    assert generate_content.call_args.kwargs["config"].temperature == 0


@pytest.mark.asyncio
async def test_shopping_list_values_stay_on_flash_lite_by_default(monkeypatch) -> None:
    generate_content = Mock(return_value=_response({"values": ["1 onion"]}))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    await gemini.recommend_shopping_list_values(["0.5 onion"])

    assert generate_content.call_args.kwargs["model"] == "gemini-2.5-flash-lite"


@pytest.mark.asyncio
async def test_text_import_ignores_per_import_model_for_extraction(monkeypatch) -> None:
    captured_models = []
    extraction = RecipeExtraction.model_validate(_extraction_payload())

    async def fake_extract_recipe(*args, **kwargs):
        captured_models.append(kwargs["model"])
        return extraction

    monkeypatch.setattr(pipeline.gemini_svc, "extract_recipe", fake_extract_recipe)
    monkeypatch.setattr(pipeline.settings, "gemini_extraction_model", "configured-extraction-model")

    events = [
        event async for event in pipeline.run_text_import_stream(
            "Ingredients: 1 onion", model="gemini-2.5-flash-lite"
        )
    ]

    assert captured_models == ["configured-extraction-model"]
    assert events[-1]["result"]["metadata"]["debug"] is None
