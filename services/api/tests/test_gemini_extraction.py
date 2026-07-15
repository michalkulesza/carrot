import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from api.models import (
    RecipeComponent,
    RecipeEnrichment,
    RecipeExtraction,
    RecipeSourceExtraction,
    StepRef,
)
from api.services import gemini, pipeline
from api.services.import_worker import _step_ingredient_refs


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


@pytest.mark.asyncio
async def test_text_extraction_uses_configured_model_and_deterministic_sampling(monkeypatch) -> None:
    generate_content = Mock(side_effect=[_response(_source_payload()), _response(_enrichment_payload())])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)
    monkeypatch.setattr(gemini.settings, "gemini_extraction_model", "configured-extraction-model")

    result = await gemini.extract_recipe("Ingredients: 1 onion")

    extraction_call, enrichment_call = generate_content.call_args_list
    assert extraction_call.kwargs["model"] == "configured-extraction-model"
    assert enrichment_call.kwargs["model"] == "gemini-2.5-flash-lite"
    assert extraction_call.kwargs["config"].temperature == 0
    assert enrichment_call.kwargs["config"].temperature == 0
    assert "Never add ingredients" in extraction_call.kwargs["config"].system_instruction
    assert "total_time_minutes" in enrichment_call.kwargs["config"].system_instruction
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
    assert "step_refs" not in RecipeSourceExtraction.model_fields
    # Query-2 schema cannot express source-owned fields — combiner must supply them.
    assert "title" not in RecipeEnrichment.model_fields
    assert "servings" not in RecipeEnrichment.model_fields
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
    ])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    result = await gemini.extract_recipe("Ingredients: 1 onion")

    assert result.components[0].ingredients[0].shopping_list_value == "1 onion"
    assert result.components[0].metric_ingredients == ["100 g onion"]
    assert generate_content.call_count == 2


@pytest.mark.asyncio
async def test_image_extraction_uses_deterministic_sampling(monkeypatch) -> None:
    generate_content = Mock(side_effect=[_response(_source_payload()), _response(_enrichment_payload())])
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    await gemini.extract_recipe_from_image(b"image", mime_type="image/jpeg", model="image-model")

    extraction_call, enrichment_call = generate_content.call_args_list
    assert extraction_call.kwargs["model"] == "image-model"
    assert enrichment_call.kwargs["model"] == "gemini-2.5-flash-lite"
    assert extraction_call.kwargs["config"].temperature == 0


@pytest.mark.asyncio
async def test_shopping_list_values_stay_on_flash_lite_by_default(monkeypatch) -> None:
    generate_content = Mock(return_value=_response({"values": ["1 onion"]}))
    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini, "_build_client", lambda: client)

    await gemini.recommend_shopping_list_values(["0.5 onion"])

    assert generate_content.call_args.kwargs["model"] == "gemini-2.5-flash-lite"


def test_step_ingredient_refs_exclude_final_assembly_step() -> None:
    component = RecipeComponent(
        steps=["Chop the onion.", "Cook the onion.", "Assemble and serve."],
        step_refs=[
            StepRef(step_index=0, ingredient_index=0, mention="onion"),
            StepRef(step_index=1, ingredient_index=0, mention="onion"),
            StepRef(step_index=2, ingredient_index=0, mention="onion"),
        ],
    )

    assert _step_ingredient_refs(component) == [
        [{"ingredient_index": 0, "mention": "onion"}],
        [{"ingredient_index": 0, "mention": "onion"}],
        [],
    ]


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
        "step_refs": [{"step_index": 0, "ingredient_index": 0, "mention": "onion"}],
    }])
    payload.update(overrides)
    return RecipeEnrichment.model_validate(payload)


def test_assembled_recipe_retains_source_fields_exactly() -> None:
    source = _one_component_source()
    enrichment = _matching_enrichment(tags=["soup"])

    assembled = gemini.assemble_recipe(source, enrichment)

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


def test_assemble_recipe_rejects_out_of_range_step_ref() -> None:
    source = _one_component_source()
    enrichment = _matching_enrichment()
    enrichment.components[0].step_refs = [StepRef(step_index=5, ingredient_index=0, mention="onion")]
    with pytest.raises(ValueError):
        gemini.assemble_recipe(source, enrichment)


def test_strip_html_preserves_structural_container_with_noise_named_theme_class() -> None:
    html = """
    <html><body class="content-sidebar">
      <nav class="recipe-navigation">Recipe index</nav>
      <div class="content-sidebar-wrap">
        <article><h1>Article introduction</h1></article>
        <div class="wprm-recipe-container">
          <h1>Beef Stroganoff</h1><p>Ingredients: beef, mushrooms</p>
        </div>
      </div>
    </body></html>
    """

    text = pipeline._strip_html(html)

    assert "Beef Stroganoff" in text
    assert "Ingredients: beef, mushrooms" in text


def test_find_jsonld_recipe_unwraps_graph() -> None:
    html = """
    <html><head><script type="application/ld+json">
    {"@context": "https://schema.org", "@graph": [
      {"@type": "WebPage", "name": "irrelevant"},
      {"@type": "Recipe", "name": "Graph Recipe", "recipeIngredient": ["1 egg"]}
    ]}
    </script></head><body></body></html>
    """

    recipe = pipeline._find_jsonld_recipe(html)

    assert recipe is not None
    assert recipe["name"] == "Graph Recipe"


def test_jsonld_recipe_steps_unpacks_how_to_sections_and_skips_abbreviated() -> None:
    data = {
        "recipeInstructions": [
            {"@type": "HowToSection", "name": "Abbreviated recipe:", "itemListElement": [
                {"@type": "HowToStep", "text": "Do the whole thing quickly."},
            ]},
            {"@type": "HowToSection", "name": "Prep", "itemListElement": [
                {"@type": "HowToStep", "text": "Chop the onion."},
                {"@type": "HowToStep", "text": "Boil the water."},
            ]},
        ]
    }

    steps = pipeline._jsonld_recipe_steps(data)

    assert steps == ["Chop the onion.", "Boil the water."]


def test_find_microdata_recipe_handles_wrapper_and_repeated_step_patterns() -> None:
    wrapper_html = """
    <div itemscope itemtype="https://schema.org/Recipe">
      <h1 itemprop="name">Test Cake</h1>
      <li itemprop="recipeIngredient">2 cups flour</li>
      <div itemprop="recipeInstructions">
        <ol><li itemprop="text">Mix dry ingredients.</li></ol>
      </div>
    </div>
    """
    repeated_html = """
    <div itemscope itemtype="http://schema.org/Recipe">
      <span itemprop="name">Test Soup</span>
      <span itemprop="recipeIngredient">1 onion</span>
      <p itemprop="recipeInstructions">Chop the onion.</p>
      <p itemprop="recipeInstructions">Simmer for 20 minutes.</p>
    </div>
    """

    wrapper = pipeline._find_microdata_recipe(wrapper_html)
    repeated = pipeline._find_microdata_recipe(repeated_html)

    assert wrapper == {
        "name": "Test Cake",
        "recipeYield": None,
        "totalTime": None,
        "recipeIngredient": ["2 cups flour"],
        "recipeInstructions": ["Mix dry ingredients."],
        "nutrition": None,
    }
    assert repeated["recipeInstructions"] == ["Chop the onion.", "Simmer for 20 minutes."]


def test_find_microdata_recipe_requires_both_ingredients_and_instructions() -> None:
    html = """
    <div itemscope itemtype="https://schema.org/Recipe">
      <span itemprop="name">Missing Instructions</span>
      <span itemprop="recipeIngredient">1 onion</span>
    </div>
    """

    assert pipeline._find_microdata_recipe(html) is None


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
async def test_text_import_honours_supplied_model_override(monkeypatch) -> None:
    captured_models = []
    extraction = RecipeExtraction.model_validate(_enrichment_payload())

    async def fake_extract_recipe(*args, **kwargs):
        captured_models.append(kwargs["model"])
        return extraction

    monkeypatch.setattr(pipeline.gemini_svc, "extract_recipe", fake_extract_recipe)
    events = [
        event async for event in pipeline.run_text_import_stream(
            "Ingredients: 1 onion", model="explicit-override-model"
        )
    ]

    assert captured_models == ["explicit-override-model"]
    assert "debug" not in events[-1]["result"]["metadata"]


@pytest.mark.asyncio
async def test_text_import_uses_configured_model_when_none_supplied(monkeypatch) -> None:
    captured_models = []
    extraction = RecipeExtraction.model_validate(_enrichment_payload())

    async def fake_extract_recipe(*args, **kwargs):
        captured_models.append(kwargs["model"])
        return extraction

    monkeypatch.setattr(pipeline.gemini_svc, "extract_recipe", fake_extract_recipe)
    events = [
        event async for event in pipeline.run_text_import_stream("Ingredients: 1 onion")
    ]

    assert captured_models == [None]
    assert "debug" not in events[-1]["result"]["metadata"]


@pytest.mark.asyncio
async def test_incomplete_text_import_is_reported_to_sentry(monkeypatch) -> None:
    extraction = RecipeExtraction.model_validate(_enrichment_payload())

    async def fake_extract_recipe(*args, **kwargs):
        return extraction

    report_failure = Mock()
    monkeypatch.setattr(pipeline.gemini_svc, "extract_recipe", fake_extract_recipe)
    monkeypatch.setattr(pipeline, "report_recipe_import_failure", report_failure)

    events = [
        event async for event in pipeline.run_text_import_stream("not a recipe")
    ]

    assert events[-1]["result"]["error"] == "Could not extract a recipe from this text."
    assert report_failure.call_args.kwargs == {
        "input_kind": "text",
        "input_size": len("not a recipe"),
        "reason": "no_complete_recipe_extracted",
    }


@pytest.mark.asyncio
async def test_import_without_allergens_makes_one_extraction_call_and_no_allergen_call(monkeypatch) -> None:
    extraction = RecipeExtraction.model_validate(_enrichment_payload(components=[{
        "role": "main",
        "ingredients": [{"name": "onion", "qty": "1", "unit": None}],
        "steps": ["Chop the onion."],
    }]))
    call_count = {"extract": 0}

    async def fake_extract_recipe(*args, **kwargs):
        call_count["extract"] += 1
        return extraction

    async def fail_analyze_allergens(*args, **kwargs):
        raise AssertionError("allergen analysis must not run when no allergens are configured")

    monkeypatch.setattr(pipeline.gemini_svc, "extract_recipe", fake_extract_recipe)
    monkeypatch.setattr(pipeline.gemini_svc, "analyze_allergens", fail_analyze_allergens)

    events = [
        event async for event in pipeline.run_text_import_stream("Ingredients: 1 onion", allergens=None)
    ]

    assert call_count["extract"] == 1
    assert events[-1]["result"]["recipe"]["components"][0]["ingredients"][0]["allergen"] is None


@pytest.mark.asyncio
async def test_import_with_allergens_only_dedicated_call_supplies_allergen_results(monkeypatch) -> None:
    extraction = RecipeExtraction.model_validate(_enrichment_payload(components=[{
        "role": "main",
        "ingredients": [{"name": "peanut butter", "qty": "1", "unit": None}],
        "steps": ["Spread the peanut butter."],
    }]))

    async def fake_extract_recipe(*args, **kwargs):
        assert "allergens" not in kwargs
        return extraction

    allergen_calls = {"count": 0}

    async def fake_analyze_allergens(ingredients, allergens, **kwargs):
        allergen_calls["count"] += 1
        return [gemini._IngredientFlag(allergen="peanuts", substitute="tahini") for _ in ingredients]

    monkeypatch.setattr(pipeline.gemini_svc, "extract_recipe", fake_extract_recipe)
    monkeypatch.setattr(pipeline.gemini_svc, "analyze_allergens", fake_analyze_allergens)

    events = [
        event async for event in pipeline.run_text_import_stream(
            "Ingredients: 1 tbsp peanut butter", allergens=["peanuts"]
        )
    ]

    assert allergen_calls["count"] == 1
    ingredient = events[-1]["result"]["recipe"]["components"][0]["ingredients"][0]
    assert ingredient["allergen"] == "peanuts"
    assert ingredient["substitute"] == "tahini"
