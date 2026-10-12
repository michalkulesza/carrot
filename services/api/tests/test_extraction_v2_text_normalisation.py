from __future__ import annotations

import pytest

from api.services import gemini
from api.services.extraction_v2.adapters import GeminiAudioEvidenceExtractor
from api.services.extraction_v2.contracts import (
    AudioExtractionInput, ExtractedRecipe, ExtractionInput, IngredientEvidence, RecipeComponentEvidence,
    StepEvidence, TextSelection, validate_extracted_recipe,
)
from api.services.extraction_v2.evidence import reference_matches
from api.services.extraction_v2.extractor import RecipeEvidenceExtractor
from api.services.extraction_v2.gemini_selection import index_text_lines, materialize_selection
from api.services.extraction_v2.merge import merge_recipes

DIRTY = "​    1 copo de  açúcar ​\t"
CLEAN = "1 copo de açúcar"


def _all_texts(recipe: ExtractedRecipe) -> list[str]:
    texts = [recipe.title or ""]
    for component in recipe.components:
        texts.append(component.name or "")
        texts.extend(fact.text for fact in [*component.ingredients, *component.steps])
    return texts


def test_contract_normalises_every_text_field() -> None:
    recipe = validate_extracted_recipe({
        "title": f" ​{CLEAN} ",
        "yield_text": " 4  porcoes ",
        "components": [{
            "name": " Massa ​",
            "ingredients": [{"text": DIRTY, "evidence_ids": ["a"]}],
            "steps": [{"text": "Misture  \n bem.  ", "evidence_ids": ["a"]}],
        }],
        "nutrition": {"calories": " 300 kcal ", "raw_text": " 300 kcal\nprotein 4 g  "},
    })

    assert recipe.title == CLEAN
    assert recipe.yield_text == "4 porcoes"
    assert recipe.components[0].name == "Massa"
    assert recipe.components[0].ingredients[0].text == CLEAN
    assert recipe.components[0].steps[0].text == "Misture bem."
    assert recipe.nutrition.calories == "300 kcal"
    assert recipe.nutrition.raw_text == "300 kcal\nprotein 4 g"


def test_invisible_only_fact_is_rejected() -> None:
    with pytest.raises(ValueError):
        ExtractedRecipe(components=[RecipeComponentEvidence(ingredients=[IngredientEvidence(text="​ ", evidence_ids=["a"])])])


@pytest.mark.asyncio
async def test_deterministic_text_extraction_is_trimmed_and_grounded() -> None:
    content = "Ingredientes:\n- 1 copo de açúcar  \n- 1 copo  de ​água \nModo de preparo:\n1. Misture tudo.  "
    recipe = await RecipeEvidenceExtractor().extract_text(ExtractionInput(content=content, evidence_ids=["caption:0"]))

    texts = [item.text for item in recipe.components[0].ingredients]
    assert texts == ["1 copo de açúcar", "1 copo de água"]
    assert all(text == text.strip() and "  " not in text for text in _all_texts(recipe))
    for fact in [*recipe.components[0].ingredients, *recipe.components[0].steps]:
        assert fact.references
        assert all(reference_matches(reference, content) for reference in fact.references)


def test_gemini_selection_is_trimmed_and_grounded() -> None:
    content = "Sauce  \n1 tomato ​\nCook  the tomato. "
    source = ExtractionInput(content=content, evidence_ids=["caption:0"])
    recipe = materialize_selection(source, index_text_lines(source), TextSelection.model_validate({
        "components": [{"heading_id": "line:1", "ingredient_line_ids": ["line:2"], "instruction_line_ids": ["line:3"]}],
    }))

    assert recipe.components[0].name == "Sauce"
    assert recipe.components[0].ingredients[0].text == "1 tomato"
    assert recipe.components[0].steps[0].text == "Cook the tomato."
    for fact in [*recipe.components[0].ingredients, *recipe.components[0].steps]:
        assert all(reference_matches(reference, content) for reference in fact.references)


def test_merge_preserves_trimmed_text_and_dedupes_dirty_duplicates() -> None:
    left = ExtractedRecipe(components=[RecipeComponentEvidence(
        ingredients=[IngredientEvidence(text="1 copo de açúcar ", evidence_ids=["a"])])])
    right = ExtractedRecipe(components=[RecipeComponentEvidence(
        ingredients=[IngredientEvidence(text=" 1 copo de açúcar", evidence_ids=["b"])],
        steps=[StepEvidence(text=" Misture.​ ", evidence_ids=["b"])],
    )])

    merged = merge_recipes(left, right)

    assert [item.text for item in merged.components[0].ingredients] == [CLEAN]
    assert merged.components[0].ingredients[0].evidence_ids == ["a", "b"]
    assert [item.text for item in merged.components[0].steps] == ["Misture."]


@pytest.mark.asyncio
async def test_audio_evidence_is_trimmed(monkeypatch: pytest.MonkeyPatch) -> None:
    transcript = "Use 1 copo de açúcar e depois misture bem."

    async def fake_audio(*_args, **_kwargs):
        return gemini.AudioRecipeEvidence.model_validate({
            "components": [{"name": " Massa ", "ingredients": ["1 copo de açúcar  "], "steps": ["misture bem. "]}],
        })

    monkeypatch.setattr(gemini, "extract_audio_recipe_evidence", fake_audio)
    recipe = await GeminiAudioEvidenceExtractor().extract_audio(AudioExtractionInput(
        transcript=transcript, retained_recipe=ExtractedRecipe(),
    ))

    assert all(text == text.strip() and " " not in text for text in _all_texts(recipe))
    assert recipe.components[0].ingredients[0].text == CLEAN
