import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from api.models import (
    EnrichmentComponent,
    RecipeEnrichment,
    RecipeExtraction,
    RecipeSourceExtraction,
)
from api.services import gemini, import_worker, pipeline
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


@pytest.mark.asyncio
async def test_text_extraction_uses_configured_model_and_deterministic_sampling(monkeypatch) -> None:
    generate_content = Mock(side_effect=[_response(_source_payload()), _response(_enrichment_payload())])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)
    monkeypatch.setattr(gemini.settings, "gemini_extraction_model", "configured-extraction-model")

    result = await gemini.extract_recipe("Ingredients: 1 onion")

    extraction_call, enrichment_call = generate_content.call_args_list
    assert extraction_call.kwargs["model"] == "configured-extraction-model"
    assert enrichment_call.kwargs["model"] == "gemini-3.1-flash-lite"
    assert extraction_call.kwargs["config"].temperature == 0
    assert enrichment_call.kwargs["config"].temperature == 0
    assert "Never add ingredients" in extraction_call.kwargs["config"].system_instruction
    assert "total_time_minutes" in enrichment_call.kwargs["config"].system_instruction
    assert "exclude unattended resting" in enrichment_call.kwargs["config"].system_instruction
    assert "1 cup frozen corn kernels" in enrichment_call.kwargs["config"].system_instruction
    assert result.total_time_minutes == 45


@pytest.mark.asyncio
async def test_query_one_uses_source_only_schema_and_query_two_is_enrichment_only(monkeypatch) -> None:
    generate_content = Mock(side_effect=[_response(_source_payload()), _response(_enrichment_payload())])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    await gemini.extract_recipe("Ingredients: 1 onion")

    extraction_call, enrichment_call = generate_content.call_args_list
    assert extraction_call.kwargs["config"].response_schema is RecipeSourceExtraction
    assert enrichment_call.kwargs["config"].response_schema is RecipeEnrichment
    # Query-1 schema cannot express enrichment-only fields.
    assert "shopping_list_values" not in RecipeSourceExtraction.model_fields
    # Query-2 schema cannot express source-owned fields — combiner must supply them.
    assert "title" not in RecipeEnrichment.model_fields
    assert "servings" not in RecipeEnrichment.model_fields
    assert "step_ingredient_line" not in EnrichmentComponent.model_fields
    # Query 2 receives the query-1 result as input.
    sent_prompt = json.loads(enrichment_call.kwargs["contents"])
    assert sent_prompt["source_recipe"]["components"] == _source_payload()["components"]


@pytest.mark.asyncio
async def test_enrichment_falls_back_only_for_misaligned_field(monkeypatch) -> None:
    source = _one_component_source().model_dump(mode="json")
    invalid_enrichment = _matching_enrichment().model_dump(mode="json")
    invalid_enrichment["components"][0]["metric_ingredients"] = ["100 g onion"]
    invalid_enrichment["components"][0]["shopping_list_values"] = ["1 onion", "1 onion"]
    generate_content = Mock(side_effect=[
        _response(source),
        _response(invalid_enrichment),
        _response(_onion_step_match_payload()),
    ])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    result = await gemini.extract_recipe("Ingredients: 1 onion")

    assert result.components[0].ingredients[0].shopping_list_value == "1 onion"
    assert result.components[0].metric_ingredients == ["1 onion"]
    assert generate_content.call_count == 3


def test_metric_weight_conversion_is_not_replaced_with_the_source_measurement() -> None:
    source = ["1 1/2 lbs. skinless salmon fillet"]
    metric = ["680 g skinless salmon fillet"]

    assert gemini._preserve_discrete_ingredient_measurements(source, metric) == metric


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


def test_metric_ingredients_require_a_metric_measurement() -> None:
    enrichment = _matching_enrichment()
    enrichment.components[0].metric_ingredients = ["4 cup coleslaw* (4 cup)"]

    with pytest.raises(ValueError, match="retains an unconverted measurement"):
        gemini._validate_metric_ingredients(enrichment)

    enrichment.components[0].metric_ingredients = ["227 g coleslaw* (4 cup)"]
    gemini._validate_metric_ingredients(enrichment)


def test_metric_ingredient_length_is_converted_to_centimetres() -> None:
    source = RecipeSourceExtraction.model_validate({
        "components": [{
            "ingredients": [{"name": "2 inch knob of ginger, finely chopped"}],
        }],
    })
    enrichment = RecipeEnrichment.model_validate(_enrichment_payload(components=[{
        "metric_ingredients": ["5 cm knob of ginger, finely chopped"],
        "imperial_ingredients": ["2 inch knob of ginger, finely chopped"],
        "metric_steps": [],
        "imperial_steps": [],
        "shopping_list_values": ["1 knob of ginger"],
    }]))

    repaired = gemini._repair_enrichment_alignment(source, enrichment)

    assert repaired.components[0].metric_ingredients == [
        "5 cm knob of ginger, finely chopped"
    ]
    gemini._validate_metric_ingredients(repaired)

    repaired.components[0].metric_ingredients = [
        "2 inch knob of ginger, finely chopped"
    ]
    with pytest.raises(ValueError, match="retains an unconverted measurement"):
        gemini._validate_metric_ingredients(repaired)


@pytest.mark.asyncio
async def test_repeated_unconverted_metric_ingredient_does_not_fail_import(monkeypatch) -> None:
    source = RecipeSourceExtraction.model_validate({
        "title": "Mexican chicken and rice",
        "components": [{
            "ingredients": [
                {"qty": "1", "unit": "cup", "name": "frozen corn kernels"},
            ],
            "steps": ["Add the corn."],
        }],
    })
    enrichment = RecipeEnrichment.model_validate(_enrichment_payload(components=[{
        "metric_ingredients": ["1 cup frozen corn kernels"],
        "imperial_ingredients": ["1 cup frozen corn kernels"],
        "metric_steps": ["Add the corn."],
        "imperial_steps": ["Add the corn."],
        "shopping_list_values": ["1 bag frozen corn kernels"],
        "shopping_list_categories": ["frozen"],
    }]))
    generate_content = Mock(side_effect=[
        _response(source.model_dump(mode="json")),
        *[_response(enrichment.model_dump(mode="json")) for _ in range(3)],
        _response({"matches": [{
            "component_index": 0,
            "step_index": 0,
            "references": [{"ingredient_index": 0, "evidence": "corn"}],
        }]}),
    ])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    result = await gemini.extract_recipe("Ingredients: 1 cup frozen corn kernels")

    component = result.components[0]
    assert component.metric_ingredients == ["1 cup frozen corn kernels"]
    assert component.ingredients[0].shopping_list_value == "1 bag frozen corn kernels"
    assert component.ingredients[0].shopping_list_category == "frozen"
    assert generate_content.call_count == 5


@pytest.mark.parametrize(
    ("source_value", "invalid_metric_value"),
    [
        ("1 cup frozen corn", "1 cup frozen corn"),
        ("16 oz black beans", "16 oz black beans"),
        ("2 inch knob of ginger", "2 inch knob of ginger"),
    ],
)
def test_unconverted_metric_measurements_fall_back_individually(
    source_value: str,
    invalid_metric_value: str,
) -> None:
    source = RecipeSourceExtraction.model_validate({
        "components": [{"ingredients": [{"name": source_value}]}],
    })
    enrichment = RecipeEnrichment.model_validate(_enrichment_payload(components=[{
        "metric_ingredients": [invalid_metric_value],
        "imperial_ingredients": [source_value],
        "shopping_list_values": [source_value],
    }]))

    repaired = gemini._repair_enrichment_alignment(source, enrichment)

    assert repaired.components[0].metric_ingredients == [source_value]


@pytest.mark.asyncio
async def test_enrichment_retries_when_recipe_time_is_missing(monkeypatch) -> None:
    source = _one_component_source().model_dump(mode="json")
    missing_time = _matching_enrichment(total_time_minutes=None).model_dump(mode="json")
    complete = _matching_enrichment(total_time_minutes=565).model_dump(mode="json")
    generate_content = Mock(side_effect=[
        _response(source),
        _response(missing_time),
        _response(complete),
        _response(_onion_step_match_payload()),
    ])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    result = await gemini.extract_recipe("Ingredients: 1 onion")

    retry_prompt = json.loads(generate_content.call_args_list[2].kwargs["contents"])
    assert result.total_time_minutes == 565
    assert generate_content.call_count == 4
    assert "total_time_minutes must be calculated" in retry_prompt["previous_validation_error"]


@pytest.mark.asyncio
async def test_image_extraction_uses_deterministic_sampling(monkeypatch) -> None:
    generate_content = Mock(side_effect=[_response(_source_payload()), _response(_enrichment_payload())])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    await gemini.extract_recipe_from_image(b"image", mime_type="image/jpeg", model="image-model")

    extraction_call, enrichment_call = generate_content.call_args_list
    assert extraction_call.kwargs["model"] == "image-model"
    assert enrichment_call.kwargs["model"] == "gemini-3.1-flash-lite"
    assert extraction_call.kwargs["config"].temperature == 0


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


def test_stated_compact_total_time_overrides_enrichment_estimate() -> None:
    source = _one_component_source().model_copy(update={"total_time_minutes": gemini.stated_total_time_minutes("Total time: 1h 5m")})
    assembled = gemini.assemble_recipe(source, _matching_enrichment(total_time_minutes=110), [[0, 0]])

    assert source.total_time_minutes == 65
    assert assembled.total_time_minutes == 65


def test_stated_total_time_stops_before_recipe_instruction_durations() -> None:
    assert gemini.stated_total_time_minutes(
        "Total time: 1 hour hour 5 minutes minutes Servings: 3 Marinate for 30 minutes."
    ) == 65


def test_enrichment_preserves_tsp_and_tbsp_in_both_unit_variants() -> None:
    source = RecipeSourceExtraction.model_validate({
        "components": [{
            "ingredients": [
                {"qty": "1", "unit": "tsp", "name": "vanilla extract"},
                {"qty": "2", "unit": "tbsp", "name": "olive oil"},
            ],
        }],
    })
    enrichment = RecipeEnrichment.model_validate(_enrichment_payload(components=[{
        "metric_ingredients": ["5 ml vanilla extract", "30 ml olive oil"],
        "imperial_ingredients": ["1 tsp vanilla extract", "2 tbsp olive oil"],
        "metric_steps": [],
        "imperial_steps": [],
        "shopping_list_values": ["1 tsp vanilla extract", "2 tbsp olive oil"],
    }]))

    repaired = gemini._repair_enrichment_alignment(source, enrichment)
    component = repaired.components[0]

    assert component.metric_ingredients == ["1 tsp vanilla extract", "2 tbsp olive oil"]
    assert component.imperial_ingredients == ["1 tsp vanilla extract", "2 tbsp olive oil"]


def test_enrichment_preserves_discrete_ingredients_in_both_unit_variants() -> None:
    source = RecipeSourceExtraction.model_validate({
        "components": [{
            "ingredients": [
                {"qty": "1/2", "name": "sweet onion"},
                {"qty": "1", "name": "stalk celery"},
            ],
        }],
    })
    enrichment = RecipeEnrichment.model_validate(_enrichment_payload(components=[{
        "metric_ingredients": ["125 g sweet onion", "30 g celery"],
        "imperial_ingredients": ["1/2 cup sweet onion", "1/4 cup celery"],
        "metric_steps": [],
        "imperial_steps": [],
        "shopping_list_values": ["1 sweet onion", "1 stalk celery"],
    }]))

    repaired = gemini._repair_enrichment_alignment(source, enrichment)
    component = repaired.components[0]

    assert component.metric_ingredients == ["1/2 sweet onion", "1 stalk celery"]
    assert component.imperial_ingredients == ["1/2 sweet onion", "1 stalk celery"]


def test_enrichment_estimates_metric_weight_for_canned_ingredients() -> None:
    source = RecipeSourceExtraction.model_validate({
        "components": [{
            "ingredients": [{"qty": "1", "unit": "can", "name": "black beans, drained and rinsed"}],
        }],
    })
    enrichment = RecipeEnrichment.model_validate(_enrichment_payload(components=[{
        "metric_ingredients": ["240 g (1 can) black beans, drained and rinsed"],
        "imperial_ingredients": ["1 can black beans, drained and rinsed"],
        "metric_steps": [],
        "imperial_steps": [],
        "shopping_list_values": ["1 can black beans"],
    }]))

    repaired = gemini._repair_enrichment_alignment(source, enrichment)
    component = repaired.components[0]

    assert component.metric_ingredients == ["240 g (1 can) black beans, drained and rinsed"]
    assert component.imperial_ingredients == ["1 can black beans, drained and rinsed"]


def test_assemble_recipe_rejects_mismatched_component_count() -> None:
    source = _one_component_source()
    enrichment = RecipeEnrichment.model_validate(_enrichment_payload(components=[]))
    with pytest.raises(ValueError):
        gemini.assemble_recipe(source, enrichment)


def test_assemble_recipe_rejects_mismatched_ingredient_count() -> None:
    source = _one_component_source()
    enrichment = _matching_enrichment()
    enrichment.components[0].metric_ingredients = []
    with pytest.raises(ValueError):
        gemini.assemble_recipe(source, enrichment)


def test_assemble_recipe_rejects_mismatched_step_count() -> None:
    source = _one_component_source()
    enrichment = _matching_enrichment()
    enrichment.components[0].metric_steps = []
    with pytest.raises(ValueError):
        gemini.assemble_recipe(source, enrichment)


def test_is_complete_accepts_ingredients_and_steps_split_across_components() -> None:
    # A recipe with sub-headed ingredient sections ("For the paste", "For the
    # pork") and one shared instruction list: no single component carries
    # both ingredients and steps, but the recipe as a whole is complete.
    recipe = RecipeExtraction.model_validate(_enrichment_payload(components=[
        {"name": "For the paste", "ingredients": [{"name": "tahini"}], "steps": []},
        {"name": "For the pork", "ingredients": [{"name": "pork mince"}], "steps": []},
        {"name": None, "ingredients": [], "steps": ["Mix the paste.", "Cook the pork."]},
    ]))

    assert pipeline._is_complete(recipe) is True


def test_is_complete_rejects_recipe_with_no_ingredients_anywhere() -> None:
    recipe = RecipeExtraction.model_validate(_enrichment_payload(components=[
        {"name": None, "ingredients": [], "steps": ["Do something."]},
    ]))

    assert pipeline._is_complete(recipe) is False


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
    assert result.components[0].ingredients[0].name == ingredient
    assert result.components[0].ingredients[0].allergen == expected_allergen
    if allergens:
        assert result.components[0].ingredients[0].substitute == "tahini"
        assert result.allergen_status == "analyzed"


@pytest.mark.asyncio
async def test_estimate_unit_variants_uses_shared_conversion_contract(monkeypatch) -> None:
    generate_content = Mock(return_value=_response({"components": [{
        "metric_ingredients": ["5 ml vanilla"],
        "imperial_ingredients": ["5 ml vanilla"],
        "metric_steps": ["Chop."],
        "imperial_steps": ["Chop."],
    }]}))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    usage = gemini.UsageTracker()
    result = await gemini.estimate_unit_variants(
        [{"name": "main", "ingredients": ["1 tsp vanilla"], "steps": ["Chop."]}], usage=usage
    )

    call = generate_content.call_args
    assert call.kwargs["config"].temperature == 0
    assert call.kwargs["config"].system_instruction == gemini._UNIT_CONVERSION_SYSTEM
    assert result.components[0].metric_ingredients == ["1 tsp vanilla"]
    assert result.components[0].imperial_ingredients == ["1 tsp vanilla"]
    assert usage.calls == 1


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
    generate_content = Mock(side_effect=[
        _response(_one_component_source().model_dump(mode="json")),
        _response(_matching_enrichment().model_dump(mode="json")),
        _response(_onion_step_match_payload()),
    ])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    await gemini.extract_recipe("Ingredients: 1 onion")

    instruction = generate_content.call_args_list[1].kwargs["config"].system_instruction
    assert "shopping_list_categories" in instruction
    for category in ("produce", "pantry", "dairy_eggs", "meat_seafood", "frozen", "other"):
        assert category in instruction
