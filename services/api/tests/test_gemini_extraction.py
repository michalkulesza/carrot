import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from api.models import (
    EnrichmentComponent,
    RecipeEnrichment,
    RecipeSourceExtraction,
)
from api.services import gemini, import_worker
from api.services.extraction_v2.contracts import ExtractedRecipe


def _response(payload: dict) -> SimpleNamespace:
    usage_metadata = SimpleNamespace(prompt_token_count=1, candidates_token_count=1)
    return SimpleNamespace(text=json.dumps(payload), usage_metadata=usage_metadata)


def _enrichment_payload(**overrides) -> dict:
    payload = {
        "total_time_minutes": 45,
        "kcal_per_serving": 0,
        "protein_per_serving": 0,
        "fat_per_serving": 0,
        "carbs_per_serving": 0,
    }
    payload.update(overrides)
    return payload


def _source_payload(**overrides) -> dict:
    payload = {"components": []}
    payload.update(overrides)
    return payload


def _onion_step_match_payload() -> dict:
    return {
        "matches": [
            {
                "component_index": 0,
                "step_index": step_index,
                "references": [{"ingredient_index": 0, "evidence": "onion"}],
            }
            for step_index in range(2)
        ],
    }


def _match(component_index: int, step_index: int, references: list[dict]) -> dict:
    return {
        "component_index": component_index,
        "step_index": step_index,
        "references": references,
    }


def test_deterministic_variants_convert_weight_without_changing_ingredient_text() -> None:
    from api.services.unit_variants import build_variants

    variants = build_variants(["about 1 1/2 lbs. skinless salmon fillet"], [])

    assert variants["metric_ingredients"] == ["about 680.4 g skinless salmon fillet"]

@pytest.mark.asyncio
async def test_step_ingredient_line_matcher_uses_numbered_choices_and_rejects_ungrounded_lines(monkeypatch) -> None:
    generate_content = Mock(side_effect=[
        _response({"matches": [
            {
                "component_index": 0,
                "step_index": 0,
                "references": [{"ingredient_index": 0, "evidence": "onion"}],
            },
            {
                "component_index": 0,
                "step_index": 1,
                "references": [{"ingredient_index": 1, "evidence": "chicken"}],
            },
        ]}),
        _response({"matches": [{
            "component_index": 0,
            "step_index": 0,
            "references": [{"ingredient_index": 2, "evidence": "onion"}],
        }]}),
    ])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    lines = await gemini.match_step_ingredient_lines(
        ["Sauté the onion.", "Top with chicken."],
        ["1 tsp cayenne pepper", "5 chicken thighs", "1 small onion"],
    )

    assert lines == [2, 1]
    call = generate_content.call_args_list[0]
    assert call.kwargs["model"] == "gemini-3.1-flash-lite"
    assert json.loads(call.kwargs["contents"])["components"][0]["ingredients"] == [
        {"index": 0, "text": "1 tsp cayenne pepper"},
        {"index": 1, "text": "5 chicken thighs"},
        {"index": 2, "text": "1 small onion"},
    ]


@pytest.mark.asyncio
async def test_step_matcher_computes_lower_middle_from_grounded_references(monkeypatch) -> None:
    generate_content = Mock(return_value=_response({"matches": [_match(0, 0, [
        {"ingredient_index": 2, "evidence": "chicken"},
        {"ingredient_index": 3, "evidence": "oil"},
        {"ingredient_index": 4, "evidence": "potatoes"},
    ])]}))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    lines = await gemini.match_step_ingredient_lines(
        ["Fry the chicken in the oil with potatoes."],
        ["flour", "bread", "chicken", "oil", "potatoes"],
    )

    assert lines == [3]
    assert generate_content.call_count == 1


@pytest.mark.asyncio
async def test_step_matcher_accepts_inflected_polish_and_german_evidence(monkeypatch) -> None:
    generate_content = Mock(return_value=_response({"matches": [
        _match(0, 0, [{"ingredient_index": 0, "evidence": "kurczakiem"}]),
        _match(0, 1, [{"ingredient_index": 1, "evidence": "Zwiebeln"}]),
    ]}))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    lines = await gemini.match_step_ingredient_lines(
        ["Wymieszaj z kurczakiem.", "Zwiebeln kurz anbraten."],
        ["kurczak", "Zwiebel"],
    )

    assert lines == [0, 1]
    assert generate_content.call_count == 1


@pytest.mark.asyncio
async def test_step_matcher_retries_only_missing_or_ungrounded_steps(monkeypatch) -> None:
    generate_content = Mock(side_effect=[
        _response({"matches": [
            _match(0, 0, [{"ingredient_index": 0, "evidence": "onion"}]),
        ]}),
        _response({"matches": [
            _match(0, 1, [{"ingredient_index": 1, "evidence": "chicken"}]),
        ]}),
    ])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    lines = await gemini.match_step_ingredient_lines(
        ["Chop the onion.", "Top with chicken."],
        ["onion", "chicken thighs"],
    )

    retry_prompt = json.loads(generate_content.call_args_list[1].kwargs["contents"])
    assert lines == [0, 1]
    assert retry_prompt["components"][0]["steps"] == [
        {"index": 1, "text": "Top with chicken."},
    ]
    assert "retry_reason" in retry_prompt


@pytest.mark.asyncio
async def test_step_matcher_returns_null_when_retry_is_still_invalid(monkeypatch) -> None:
    duplicate_matches = {"matches": [
        _match(0, 0, [{"ingredient_index": 0, "evidence": "onion"}]),
        _match(0, 0, [{"ingredient_index": 0, "evidence": "onion"}]),
    ]}
    generate_content = Mock(side_effect=[
        _response(duplicate_matches),
        _response(duplicate_matches),
    ])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    lines = await gemini.match_step_ingredient_lines(
        ["Chop the onion."],
        ["1 onion"],
    )

    assert lines == [None]
    assert generate_content.call_count == 2


@pytest.mark.asyncio
async def test_step_matcher_batches_all_recipe_components_in_one_request(monkeypatch) -> None:
    generate_content = Mock(return_value=_response({"matches": [
        _match(0, 0, [{"ingredient_index": 0, "evidence": "onion"}]),
        _match(1, 0, [{"ingredient_index": 0, "evidence": "chicken"}]),
    ]}))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    lines = await gemini.match_recipe_step_ingredient_lines([
        {"steps": ["Chop the onion."], "ingredients": ["1 onion"]},
        {"steps": ["Fry the chicken."], "ingredients": ["2 chicken thighs"]},
    ])

    prompt = json.loads(generate_content.call_args.kwargs["contents"])
    assert lines == [[0], [0]]
    assert generate_content.call_count == 1
    assert generate_content.call_args.kwargs["model"] == "gemini-3.1-flash-lite"
    assert [component["component_index"] for component in prompt["components"]] == [0, 1]


@pytest.mark.asyncio
async def test_step_matcher_failure_does_not_fail_recipe_import(monkeypatch) -> None:
    source = RecipeSourceExtraction.model_validate({
        "components": [{
            "ingredients": [{"name": "onion"}],
            "steps": ["Chop the onion."],
        }],
    })

    async def fail_matcher(*args, **kwargs):
        raise ValueError("invalid matcher response")

    monkeypatch.setattr(gemini, "match_recipe_step_ingredient_lines", fail_matcher)

    lines = await gemini._match_source_step_ingredient_lines_safely(
        source,
        generous=False,
        usage=None,
    )

    assert lines == [[None]]


def test_step_matcher_does_not_accept_numeric_quantity_as_grounding() -> None:
    assert not gemini._reference_is_grounded(
        "Bake for 15 minutes.",
        "15 chicken thighs",
        "15",
    )


@pytest.mark.asyncio
async def test_enrichment_retries_when_recipe_time_is_missing(monkeypatch) -> None:
    source = _one_component_source()
    missing_time = _matching_enrichment(total_time_minutes=None).model_dump(mode="json")
    complete = _matching_enrichment(total_time_minutes=565).model_dump(mode="json")
    generate_content = Mock(side_effect=[
        _response(missing_time),
        _response(complete),
    ])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    enrichment = await gemini._enrich_recipe(source, None, False, None)
    result = gemini.assemble_recipe(source, enrichment)

    retry_prompt = json.loads(generate_content.call_args_list[1].kwargs["contents"])
    assert result.total_time_minutes == 565
    assert generate_content.call_count == 2
    assert "total_time_minutes must be calculated" in retry_prompt["previous_validation_error"]


@pytest.mark.asyncio
async def test_audio_transcription_uses_flash_lite_and_faithful_prompt(monkeypatch) -> None:
    response = SimpleNamespace(text="Dodaj dwie łyżki oliwy.")
    generate_content = Mock(return_value=response)
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    transcript = await gemini.transcribe_audio(b"mp3-audio")

    call = generate_content.call_args
    audio_part, request = call.kwargs["contents"]
    assert transcript == "Dodaj dwie łyżki oliwy."
    assert call.kwargs["model"] == "gemini-3.1-flash-lite"
    assert audio_part.inline_data.mime_type == "audio/mpeg"
    assert audio_part.inline_data.data == b"mp3-audio"
    assert request == "Transcribe the spoken audio in this file."
    assert call.kwargs["config"].temperature == 0
    assert "[inaudible]" in call.kwargs["config"].system_instruction
    assert "never translate" in call.kwargs["config"].system_instruction
    assert "do not add headings" in call.kwargs["config"].system_instruction


@pytest.mark.asyncio
async def test_audio_transcription_honours_model_override(monkeypatch) -> None:
    generate_content = Mock(return_value=SimpleNamespace(text="Transcript"))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    await gemini.transcribe_audio(b"mp3-audio", model="gemini-3.1-flash-lite")

    assert generate_content.call_args.kwargs["model"] == "gemini-3.1-flash-lite"


@pytest.mark.asyncio
async def test_shopping_list_values_stay_on_flash_lite_by_default(monkeypatch) -> None:
    generate_content = Mock(return_value=_response({"values": ["1 onion"]}))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    await gemini.recommend_shopping_list_values(["0.5 onion"])

    assert generate_content.call_args.kwargs["model"] == "gemini-3.1-flash-lite"


def test_import_normalizes_malformed_parenthetical_ingredient_commas() -> None:
    assert import_worker._normalize_ingredient_punctuation(
        "1 clove garlic (, minced)"
    ) == "1 clove garlic, minced"
    assert import_worker._normalize_ingredient_punctuation(
        "2 tsp lemongrass paste (, optional (Note 4))"
    ) == "2 tsp lemongrass paste, optional (Note 4)"


def _one_component_source() -> RecipeSourceExtraction:
    return RecipeSourceExtraction.model_validate({
        "title": "Onion Soup",
        "servings": 4,
        "components": [{
            "role": "main",
            "name": None,
            "yield_note": None,
            "ingredients": [{"qty": "1", "unit": None, "name": "onion"}],
            "steps": ["Chop the onion.", "Cook the onion."],
        }],
    })


def _matching_enrichment(**overrides) -> RecipeEnrichment:
    payload = _enrichment_payload(components=[{
        "metric_ingredients": ["1 onion"],
        "imperial_ingredients": ["1 onion"],
        "metric_steps": ["Chop the onion.", "Cook the onion."],
        "imperial_steps": ["Chop the onion.", "Cook the onion."],
        "shopping_list_values": ["1 onion"],
        "shopping_list_categories": ["produce"],
    }])
    payload.update(overrides)
    return RecipeEnrichment.model_validate(payload)


def test_assembled_recipe_retains_source_fields_exactly() -> None:
    source = _one_component_source()
    enrichment = _matching_enrichment(tags=["soup"])

    assembled = gemini.assemble_recipe(source, enrichment, [[0, 0]])

    assert assembled.title == "Onion Soup"
    assert assembled.servings == 4
    assert assembled.total_time_minutes == 45
    assert len(assembled.components) == 1
    component = assembled.components[0]
    assert [i.qty for i in component.ingredients] == ["1"]
    assert [i.name for i in component.ingredients] == ["onion"]
    assert component.steps == ["Chop the onion.", "Cook the onion."]
    assert component.metric_ingredients == ["1 onion"]
    assert assembled.tags == ["soup"]
    assert component.ingredients[0].shopping_list_category == "produce"
    assert component.shopping_list_categories == ["produce"]
    assert component.step_ingredient_line == [0, 0]


def test_source_total_time_overrides_enrichment_estimate() -> None:
    source = _one_component_source().model_copy(update={"total_time_minutes": 65})
    assembled = gemini.assemble_recipe(source, _matching_enrichment(total_time_minutes=110), [[0, 0]])

    assert source.total_time_minutes == 65
    assert assembled.total_time_minutes == 65


def test_deterministic_variants_preserve_spoons_counts_and_cups() -> None:
    from api.services.unit_variants import build_variants

    variants = build_variants(["1 tsp vanilla extract", "2 tbsp olive oil", "1/2 sweet onion", "2 cups flour"], [])

    assert variants["metric_ingredients"] == ["1 tsp vanilla extract", "2 tbsp olive oil", "1/2 sweet onion", "2 cups flour"]
    assert variants["imperial_ingredients"] == variants["metric_ingredients"]


def test_deterministic_variants_convert_length_measurements() -> None:
    from api.services.unit_variants import build_variants

    variants = build_variants(["2 inch knob of ginger, finely chopped"], [])

    assert variants["metric_ingredients"] == ["5.1 cm knob of ginger, finely chopped"]
    assert variants["imperial_ingredients"] == ["2 inch knob of ginger, finely chopped"]

def test_assemble_recipe_rejects_mismatched_component_count() -> None:
    source = _one_component_source()
    enrichment = RecipeEnrichment.model_validate(_enrichment_payload(components=[]))
    with pytest.raises(ValueError):
        gemini.assemble_recipe(source, enrichment)


def test_assemble_recipe_rejects_mismatched_ingredient_count() -> None:
    source = _one_component_source()
    enrichment = _matching_enrichment()
    enrichment.components[0].shopping_list_values = []
    with pytest.raises(ValueError):
        gemini.assemble_recipe(source, enrichment)


@pytest.mark.asyncio
@pytest.mark.parametrize("allergens, expected_allergen, expected_calls", [
    (None, None, 1),
    (["peanuts"], "peanuts", 2),
])
async def test_v2_enrichment_runs_allergen_analysis_only_when_configured(
    monkeypatch, allergens, expected_allergen, expected_calls,
) -> None:
    ingredient = "1 tbsp peanut butter" if allergens else "1 onion"
    source = ExtractedRecipe.model_validate({
        "title": "Simple spread",
        "components": [{"ingredients": [{"text": ingredient, "evidence_ids": ["pasted_text:0"]}]}],
    })
    enrichment = {"components": [{
        "metric_ingredients": [ingredient],
        "imperial_ingredients": [ingredient],
        "metric_steps": [],
        "imperial_steps": [],
        "shopping_list_values": [ingredient],
        "shopping_list_categories": ["pantry"],
    }]}
    responses = [_response(enrichment)]
    if allergens:
        responses.append(_response({"results": [{"allergen": "peanuts", "substitute": "tahini"}]}))
    generate_content = Mock(side_effect=responses)
    monkeypatch.setattr(gemini, "_build_client", lambda: SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))

    result = await gemini.enrich_v2_recipe(source, allergens=allergens)

    assert generate_content.call_count == expected_calls
    expected_name = "peanut butter" if allergens else "onion"
    parsed_ingredient = result.components[0].ingredients[0]
    assert parsed_ingredient.name == expected_name
    assert parsed_ingredient.shopping_list_value == ingredient
    assert parsed_ingredient.qty == ("1" if allergens else "1")
    assert parsed_ingredient.unit == ("tbsp" if allergens else None)
    assert result.components[0].ingredients[0].allergen == expected_allergen
    if allergens:
        assert result.components[0].ingredients[0].substitute == "tahini"
        assert result.allergen_status == "analyzed"


@pytest.mark.asyncio
async def test_v2_enrichment_uses_parser_and_keeps_uncertain_source_text(monkeypatch) -> None:
    source = ExtractedRecipe.model_validate({
        "title": "Example",
        "components": [{"ingredients": [
            {"text": "1,2 litra wody", "evidence_ids": ["pasted_text:0"]},
            {"text": "10 g fresh yeast, or 5g instant yeast", "evidence_ids": ["pasted_text:1"]},
            {"text": "40 cl crème fraîche", "evidence_ids": ["pasted_text:2"]},
            {"text": "2 sztuki cytryny", "evidence_ids": ["pasted_text:3"]},
            {"text": "260ml Lukewarm milk 38-40°C (310ml if you want to skip egg)", "evidence_ids": ["pasted_text:4"]},
        ]}],
    })
    enrichment = {"components": [{
        "metric_ingredients": ["1.2 l wody", "10 g fresh yeast, or 5g instant yeast", "40 cl crème fraîche", "2 sztuki cytryny", "260 ml Lukewarm milk"],
        "imperial_ingredients": ["1.2 l wody", "10 g fresh yeast, or 5g instant yeast", "40 cl crème fraîche", "2 sztuki cytryny", "260 ml Lukewarm milk"],
        "metric_steps": [],
        "imperial_steps": [],
        "shopping_list_values": ["1,2 litra wody", "10 g fresh yeast, or 5g instant yeast", "40 cl crème fraîche", "2 sztuki cytryny", "260ml Lukewarm milk 38-40°C (310ml if you want to skip egg)"],
        "shopping_list_categories": ["other", "other", "other", "produce", "dairy_eggs"],
    }]}
    generate_content = Mock(return_value=_response(enrichment))
    monkeypatch.setattr(gemini, "_build_client", lambda: SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))

    result = await gemini.enrich_v2_recipe(source)

    ingredients = result.components[0].ingredients
    assert (ingredients[0].qty, ingredients[0].unit, ingredients[0].name) == ("1.2", "l", "wody")
    assert ingredients[0].shopping_list_value == "1,2 litra wody"
    assert (ingredients[1].qty, ingredients[1].unit, ingredients[1].name) == (
        None, None, "10 g fresh yeast, or 5g instant yeast",
    )
    assert (ingredients[2].qty, ingredients[2].unit, ingredients[2].name) == ("40", "cl", "crème fraîche")
    assert (ingredients[3].qty, ingredients[3].unit, ingredients[3].name) == ("2", "piece", "cytryny")
    assert (ingredients[4].qty, ingredients[4].unit, ingredients[4].name) == (
        "260", "ml", "Lukewarm milk 38-40°C (310ml if you want to skip egg)",
    )


@pytest.mark.asyncio
async def test_allergen_analysis_discards_uncertain_gluten_in_processed_sauces(monkeypatch) -> None:
    generate_content = Mock(return_value=_response({"results": [
        {"allergen": "gluten", "substitute": "gluten-free hot sauce"},
        {"allergen": "gluten", "substitute": "gluten-free sauce"},
        {"allergen": "gluten", "substitute": "tamari"},
    ]}))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    flags = await gemini.analyze_allergens(
        [
            "4 tbsp chili garlic sauce",
            "2 tbsp gluten-free dipping sauce",
            "2 tbsp sauce containing wheat",
        ],
        ["gluten"],
    )

    assert [flag.allergen for flag in flags] == [None, None, "gluten"]
    assert flags[0].substitute is None
    instruction = generate_content.call_args.kwargs["config"].system_instruction
    assert '"Chili garlic sauce" alone is not evidence of gluten' in " ".join(
        instruction.split()
    )


def test_enrichment_repairs_only_invalid_shopping_categories() -> None:
    source = RecipeSourceExtraction.model_validate({
        "components": [{
            "ingredients": [{"name": "onion"}, {"name": "mystery item"}],
            "steps": [],
        }],
    })
    enrichment = RecipeEnrichment.model_validate(_enrichment_payload(components=[{
        "metric_ingredients": ["onion", "mystery item"],
        "imperial_ingredients": ["onion", "mystery item"],
        "metric_steps": [],
        "imperial_steps": [],
        "shopping_list_values": ["1 onion", "1 mystery item"],
        "shopping_list_categories": ["produce", "invented"],
    }]))

    repaired = gemini._repair_enrichment_alignment(source, enrichment)

    assert repaired.components[0].shopping_list_categories == ["produce", "other"]


@pytest.mark.asyncio
async def test_enrichment_prompt_contains_fixed_shopping_category_catalog(monkeypatch) -> None:
    generate_content = Mock(return_value=_response(_matching_enrichment().model_dump(mode="json")))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    await gemini._enrich_recipe(_one_component_source(), None, False, None)

    instruction = generate_content.call_args.kwargs["config"].system_instruction
    assert "shopping_list_categories" in instruction
    for category in ("produce", "pantry", "dairy_eggs", "meat_seafood", "frozen", "other"):
        assert category in instruction
