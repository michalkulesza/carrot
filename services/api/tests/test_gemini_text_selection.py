from __future__ import annotations

import asyncio

import pytest

from api.services.extraction_v2.contracts import ExtractionInput, TextSelection
from api.services.extraction_v2.extractor import RecipeEvidenceExtractor
from api.services.extraction_v2.gemini_selection import (
    HybridTextExtractor,
    index_text_lines,
    materialize_selection,
)
from api.services.extraction_v2.evidence import reference_matches


def _source() -> ExtractionInput:
    content = "Sauce\n1 tomato\nsalt to taste\nAssembly\nCook the tomato.\nMacros per serving: under 500 calories | 10g protein"
    return ExtractionInput(content=content, evidence_ids=["caption:0"])


def test_selection_copies_exact_lines_and_grounds_nutrition_qualifiers() -> None:
    source = _source()
    indexed = index_text_lines(source)
    recipe = materialize_selection(source, indexed, TextSelection.model_validate({
        "components": [
            {"heading_id": "line:1", "ingredient_line_ids": ["line:2", "line:3"]},
            {"instruction_line_ids": ["line:5"]},
        ],
        "nutrition": {
            "line_ids": ["line:6"], "basis": "per_serving",
            "basis_quote": {"line_id": "line:6", "quote": "per serving"},
            "calories": {"line_id": "line:6", "quote": "under 500 calories"},
            "protein": {"line_id": "line:6", "quote": "10g protein"},
        },
    }))

    assert [item.text for item in recipe.components[0].ingredients] == ["1 tomato", "salt to taste"]
    assert recipe.components[0].steps == []
    assert [item.text for item in recipe.components[1].steps] == ["Cook the tomato."]
    assert recipe.nutrition.calories == "500"
    assert recipe.nutrition.protein == "10"
    assert recipe.nutrition.raw_text == "Macros per serving: under 500 calories | 10g protein"
    assert all(reference_matches(reference, source.content) for reference in recipe.nutrition.references)


def test_selection_removes_leading_emoji_markers_and_keeps_precise_references() -> None:
    source = ExtractionInput(
        content="✔️260 g chicken\n1️⃣ Mix thoroughly.\n2. Serve hot.",
        evidence_ids=["caption:0"],
    )
    recipe = materialize_selection(source, index_text_lines(source), TextSelection.model_validate({
        "components": [{
            "ingredient_line_ids": ["line:1"],
            "instruction_line_ids": ["line:2", "line:3"],
        }],
    }))

    ingredient = recipe.components[0].ingredients[0]
    steps = recipe.components[0].steps
    assert ingredient.text == "260 g chicken"
    assert [step.text for step in steps] == ["Mix thoroughly.", "Serve hot."]
    assert ingredient.references[0].quote == ingredient.text
    assert [step.references[0].quote for step in steps] == [step.text for step in steps]
    assert all(
        reference_matches(reference, source.content)
        for fact in [ingredient, *steps]
        for reference in fact.references
    )


def test_per_serving_nutrition_fields_contain_only_source_numbers() -> None:
    source = ExtractionInput(
        content="Per serving: 503 kcal | 38 g protein | 26 g fat | 34,5 g carbohydrates",
        evidence_ids=["caption:0"],
    )
    recipe = materialize_selection(source, index_text_lines(source), TextSelection.model_validate({
        "nutrition": {
            "line_ids": ["line:1"],
            "basis": "per_serving",
            "basis_quote": {"line_id": "line:1", "quote": "Per serving"},
            "calories": {"line_id": "line:1", "quote": "503 kcal"},
            "protein": {"line_id": "line:1", "quote": "38 g protein"},
            "fat": {"line_id": "line:1", "quote": "26 g fat"},
            "carbohydrates": {"line_id": "line:1", "quote": "34,5 g carbohydrates"},
        },
    }))

    assert recipe.nutrition.calories == "503"
    assert recipe.nutrition.protein == "38"
    assert recipe.nutrition.fat == "26"
    assert recipe.nutrition.carbohydrates == "34,5"
    assert recipe.nutrition.raw_text == source.content


@pytest.mark.parametrize("selection", [
    {"components": [{"ingredient_line_ids": ["line:2", "line:2"]}]},
    {"components": [{"ingredient_line_ids": ["line:2"]}, {"instruction_line_ids": ["line:2"]}]},
    {"components": [{"ingredient_line_ids": ["line:99"]}]},
    {"components": [{"ingredient_line_ids": ["line:3", "line:2"]}]},
    {"components": [{"heading_id": "line:4", "ingredient_line_ids": ["line:2"]}]},
    {"yield_line_ids": ["line:99"]},
    {"yield_line_ids": ["line:2", "line:2"]},
    {"nutrition": {"line_ids": ["line:6"], "basis": "per_serving"}},
    {"nutrition": {"line_ids": ["line:6"], "calories": {"line_id": "line:6", "quote": " "}}},
    {"nutrition": {"line_ids": ["line:6"], "calories": {"line_id": "line:6", "quote": "501 calories"}}},
])
def test_selection_rejects_duplicate_conflicting_unknown_and_invented_values(selection: dict) -> None:
    source = _source()
    with pytest.raises(ValueError):
        materialize_selection(source, index_text_lines(source), TextSelection.model_validate(selection))


class _FailureSelector:
    async def select(self, source):
        raise TimeoutError


class _StaticSelector:
    def __init__(self, result: TextSelection) -> None:
        self.result = result

    async def select(self, source) -> TextSelection:
        return self.result


@pytest.mark.asyncio
async def test_hybrid_falls_back_without_merging_an_invalid_selection() -> None:
    source = ExtractionInput(content="Ingredients:\n1 onion", evidence_ids=["caption:0"])
    hybrid = HybridTextExtractor(RecipeEvidenceExtractor(), _FailureSelector())

    recipe = await hybrid.extract_text(source)

    assert [item.text for item in recipe.components[0].ingredients] == ["1 onion"]
    assert hybrid.last_diagnostic == "hybrid_selector_timeout_fell_back"


@pytest.mark.asyncio
async def test_valid_empty_and_partial_selection_do_not_resurrect_deterministic_output() -> None:
    source = ExtractionInput(content="Ingredients:\n1 onion", evidence_ids=["caption:0"])
    empty = HybridTextExtractor(RecipeEvidenceExtractor(), _StaticSelector(TextSelection()))
    partial = HybridTextExtractor(RecipeEvidenceExtractor(), _StaticSelector(TextSelection.model_validate({
        "components": [{"ingredient_line_ids": ["line:2"]}],
    })))

    assert (await empty.extract_text(source)).components == []
    assert [item.text for item in (await partial.extract_text(source)).components[0].ingredients] == ["1 onion"]


def test_repeated_lines_and_span_boundaries_keep_distinct_evidence() -> None:
    source = ExtractionInput(
        content="salt  salt",
        evidence_ids=["caption:0", "creator_comment:0"],
        spans=[
            {"evidence_id": "caption:0", "start": 0, "end": 4},
            {"evidence_id": "creator_comment:0", "start": 6, "end": 10},
        ],
    )
    indexed = index_text_lines(source)
    recipe = materialize_selection(source, indexed, TextSelection.model_validate({
        "components": [{"ingredient_line_ids": ["line:1.1", "line:1.2"]}],
    }))

    assert [item.evidence_ids for item in recipe.components[0].ingredients] == [["caption:0"], ["creator_comment:0"]]


def test_selection_materializes_grounded_yield_and_servings_from_a_heading() -> None:
    source = ExtractionInput(
        content="Składniki na 2 porcje:\n✔️260 g kurczaka",
        evidence_ids=["caption:0"],
    )
    recipe = materialize_selection(source, index_text_lines(source), TextSelection.model_validate({
        "components": [{"heading_id": "line:1", "ingredient_line_ids": ["line:2"]}],
        "yield_line_ids": ["line:1"],
    }))

    assert recipe.yield_text == "Składniki na 2 porcje:"
    assert recipe.yield_servings == "2"
    assert recipe.yield_evidence_ids == ["caption:0"]
    assert len(recipe.yield_references) == 1
    assert reference_matches(recipe.yield_references[0], source.content)


@pytest.mark.asyncio
async def test_concurrent_hybrid_diagnostics_are_task_local() -> None:
    source = ExtractionInput(content="Ingredients:\n1 onion", evidence_ids=["caption:0"])
    failed, succeeded = asyncio.Event(), asyncio.Event()

    class Selector:
        async def select(self, indexed):
            if indexed.content.startswith("Ingredients"):
                raise TimeoutError
            await failed.wait()
            return TextSelection()

    hybrid = HybridTextExtractor(RecipeEvidenceExtractor(), Selector())

    async def failure() -> str | None:
        await hybrid.extract_text(source)
        failed.set()
        await succeeded.wait()
        return hybrid.last_diagnostic

    async def success() -> str | None:
        await hybrid.extract_text(ExtractionInput(content="No recipe", evidence_ids=["other"]))
        succeeded.set()
        return hybrid.last_diagnostic

    assert await asyncio.gather(failure(), success()) == ["hybrid_selector_timeout_fell_back", None]


def test_unspecified_basis_never_populates_a_per_serving_field() -> None:
    source = _source()
    recipe = materialize_selection(source, index_text_lines(source), TextSelection.model_validate({
        "nutrition": {"line_ids": ["line:6"], "calories": {"line_id": "line:6", "quote": "under 500 calories"}},
    }))

    assert recipe.nutrition.calories is None
    assert recipe.nutrition.raw_text == "Macros per serving: under 500 calories | 10g protein"


@pytest.mark.parametrize("heading,ingredient,step", [
    ("Składniki", "sól do smaku", "Wymieszaj dokładnie."),
    ("Zutaten", "Salz nach Geschmack", "Gründlich verrühren."),
    ("Ingrédients", "sel à volonté", "Mélangez bien."),
    ("Ingredientes", "sal al gusto", "Mezcla bien."),
    ("Ingredients", "salt to taste", "Mix well."),
])
def test_selection_preserves_all_supported_languages_without_translation(heading: str, ingredient: str, step: str) -> None:
    source = ExtractionInput(content=f"{heading}\n{ingredient}\n{step}", evidence_ids=["caption:0"])
    recipe = materialize_selection(source, index_text_lines(source), TextSelection.model_validate({
        "components": [{"heading_id": "line:1", "ingredient_line_ids": ["line:2"], "instruction_line_ids": ["line:3"]}],
    }))

    assert recipe.components[0].name == heading
    assert recipe.components[0].ingredients[0].text == ingredient
    assert recipe.components[0].steps[0].text == step


@pytest.mark.parametrize("basis,label", [("per_100g", "per 100 g"), ("whole_recipe", "whole recipe")])
def test_multiline_non_per_serving_nutrition_is_raw_only(basis: str, label: str) -> None:
    source = ExtractionInput(content=f"Calories: 900\nProtein: 30 g\n{label}", evidence_ids=["caption:0"])
    recipe = materialize_selection(source, index_text_lines(source), TextSelection.model_validate({
        "nutrition": {
            "line_ids": ["line:1", "line:2", "line:3"], "basis": basis,
            "basis_quote": {"line_id": "line:3", "quote": label},
            "calories": {"line_id": "line:1", "quote": "Calories: 900"},
        },
    }))

    assert recipe.nutrition.calories is None
    assert recipe.nutrition.raw_text == source.content
