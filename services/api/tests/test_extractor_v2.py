from __future__ import annotations

import pytest

from api.services.extraction_v2.contracts import ExtractedRecipe, ExtractionInput, LanguageResult
from api.services.extraction_v2.evidence import reference_matches
from api.services.extraction_v2.extractor import RecipeEvidenceExtractor
from api.services.extraction_v2.orchestrator import ExtractionDependencies, ExtractionOrchestrator


@pytest.mark.asyncio
async def test_text_extractor_preserves_groups_commas_and_segment_attribution() -> None:
    content = (
        "Ingredients:\nMain:\n- 2 tomatoes, drained\n- salt to taste\nSauce:\n- Tomato sauce\n"
        "Instructions:\n1. Mix tomatoes, then cook for 10 minutes.\n2. Serve."
    )
    source = ExtractionInput(
        content=content,
        evidence_ids=["opaque-caption", "opaque-comment"],
        spans=[
            {"evidence_id": "opaque-caption", "start": 0, "end": content.index("Instructions")},
            {"evidence_id": "opaque-comment", "start": content.index("Instructions"), "end": len(content)},
        ],
    )
    recipe = await RecipeEvidenceExtractor().extract_text(source)

    assert [component.name for component in recipe.components] == ["Main", "Sauce", None]
    assert [item.text for item in recipe.components[0].ingredients] == ["2 tomatoes, drained", "salt to taste"]
    assert [item.text for item in recipe.components[1].ingredients] == ["Tomato sauce"]
    assert [item.text for item in recipe.components[2].steps] == ["Mix tomatoes, then cook for 10 minutes.", "Serve."]
    for component in recipe.components:
        for fact in [*component.ingredients, *component.steps]:
            assert all(reference_matches(reference, content) for reference in fact.references)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("ingredients", "instructions"),
    [
        ("Ingredients", "Instructions"),
        ("Składniki", "Przygotowanie"),
        ("Zutaten", "Zubereitung"),
        ("Ingrédients", "Préparation"),
        ("Ingredientes", "Preparación"),
    ],
)
async def test_supported_language_headings_extract_without_translation(ingredients: str, instructions: str) -> None:
    source = ExtractionInput(content=f"{ingredients}:\n- salt to taste\n{instructions}:\n1. Cook and serve.", evidence_ids=["source"])

    recipe = await RecipeEvidenceExtractor().extract_text(source)

    assert recipe.components[0].ingredients[0].text == "salt to taste"
    assert recipe.components[0].steps[0].text == "Cook and serve."


@pytest.mark.asyncio
async def test_html_extractor_keeps_title_links_and_ignores_nutrition() -> None:
    html = """
    <main><h1>Chicken with sauce</h1><h2>Ingredients</h2><h3>Sauce</h3>
    <ul><li><a href="/sauce">Tomato sauce</a></li><li>salt to taste</li></ul>
    <h2>Instructions</h2><ol><li>Cook the chicken.</li><li>Serve.</li></ol>
    <h2>Nutrition</h2><table><tr><td>500 calories</td></tr></table></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    component = recipe.components[0]
    assert recipe.title == "Chicken with sauce"
    assert component.name == "Sauce"
    assert [item.text for item in component.ingredients] == ["Tomato sauce", "salt to taste"]
    assert component.ingredients[0].links[0].url == "/sauce"
    assert [item.text for item in recipe.components[1].steps] == ["Cook the chicken.", "Serve."]
    assert component.ingredients[0].links[0].references[0].locator_kind == "html"
    for item in [*component.ingredients, *recipe.components[1].steps]:
        assert all(reference_matches(reference, html) for reference in item.references)


@pytest.mark.asyncio
async def test_html_extractor_uses_recipe_h2_as_title_when_h1_is_absent() -> None:
    html = """
    <main><h2>Chicken Burger</h2><h3>Ingredients</h3><ul><li>1 chicken breast</li></ul>
    <h3>Instructions</h3><ol><li>Cook the chicken.</li></ol></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.title == "Chicken Burger"


@pytest.mark.asyncio
async def test_html_extractor_retains_a_grounded_title_when_no_recipe_sections_exist() -> None:
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(
        content="<main><h1>Mongolian Beef</h1><p>Story text only.</p></main>", evidence_ids=["html"],
    ))

    assert recipe.title == "Mongolian Beef"
    assert recipe.components == []


@pytest.mark.asyncio
async def test_html_extractor_uses_leaf_recipe_facts_and_extracts_metadata() -> None:
    html = """
    <main><p>After the death of a cookbook author who changed how Americans cook.</p>
    <h2>Ingredients</h2><div><span>Yield:</span><span>6 servings</span></div>
    <ul><li><p>1 onion</p></li><li><p>2 carrots</p></li></ul>
    <h5>Nutritional analysis per serving</h5>
    <p>663 calories; 18 grams fat; 30 grams protein; 88 grams carbs</p>
    <h2>Preparation</h2><ol><li><div>Step 1</div><div><p>Cook the vegetables.</p></div></li></ol>
    <p>Private Notes</p><p>Readers cook this recipe often.</p>
    <h2>Ratings</h2><p>Readers cook this recipe often.</p></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [item.text for item in recipe.components[0].ingredients] == ["1 onion", "2 carrots"]
    assert [item.text for item in recipe.components[0].steps] == ["Cook the vegetables."]
    assert recipe.yield_text == "6 servings"
    assert recipe.yield_servings == "6"
    assert recipe.nutrition and recipe.nutrition.calories == "663"
    assert recipe.nutrition.protein == "30"
    assert recipe.nutrition.fat == "18"
    assert recipe.nutrition.carbohydrates == "88"


@pytest.mark.asyncio
async def test_html_extractor_reads_inline_serves_and_nutrition() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Instructions</h3><ol><li>Cook.</li></ol>
    <div><span>Serves </span><span>8</span><span> Rolls</span></div>
    <h3>Nutrition</h3><div>Serving: 1 roll | Calories: 249kcal | Carbohydrates: 49g | Protein: 7g | Fat: 2g</div></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.yield_text == "8 Rolls"
    assert recipe.yield_servings == "8"
    assert recipe.nutrition and recipe.nutrition.calories == "249"
    assert recipe.nutrition.carbohydrates == "49"
    assert recipe.nutrition.protein == "7"
    assert recipe.nutrition.fat == "2"


@pytest.mark.asyncio
async def test_html_extractor_reads_dense_nutrition_facts() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Instructions</h3><ol><li>Cook.</li></ol>
    <h3>Nutrition Facts</h3><div>Calories 444 Calories from Fat 243 % Daily Value* Fat 27g 42% Saturated Fat 7g 44% Carbohydrates 27g 9% Sugar 16g 18% Protein 23g 46%</div>
    </main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.nutrition.calories == "444"
    assert recipe.nutrition.fat == "27"
    assert recipe.nutrition.carbohydrates == "27"
    assert recipe.nutrition.protein == "23"


@pytest.mark.asyncio
async def test_html_extractor_stops_serves_at_time_metadata() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Instructions</h3><ol><li>Cook.</li></ol>
    <div><div><span>Serves </span><span>1 serving</span></div><div>Prep Time 2 minutes</div></div>
    <div><h3>Nutrition</h3><div>Calories: 260kcal, Carbohydrates: 36g, Protein: 12g, Fat: 7g</div></div>
    <p>Copyright text that is not nutrition.</p></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.yield_text == "1 serving"
    assert recipe.yield_servings == "1"
    assert recipe.nutrition and recipe.nutrition.calories == "260"
    assert recipe.nutrition.carbohydrates == "36"


@pytest.mark.asyncio
@pytest.mark.parametrize(("label", "value", "minutes"), [
    ("Total Time", "1 hour 30 minutes", 90),
    ("Total Time", "1h 5m", 65),
    ("Czas całkowity", "45 minut", 45),
    ("Gesamtzeit", "1 Stunde 15 Minuten", 75),
    ("Temps total", "1 heure 20 minutes", 80),
    ("Tiempo total", "2 horas 5 minutos", 125),
])
async def test_html_extractor_reads_total_time_in_supported_languages(label: str, value: str, minutes: int) -> None:
    html = f"""
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Instructions</h3><ol><li>Cook.</li></ol>
    <div>{label}: {value}</div></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.total_time_minutes == minutes
    assert recipe.total_time_text == value


@pytest.mark.asyncio
async def test_html_extractor_stops_total_time_at_recipe_card_metadata() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Instructions</h3><ol><li>Cook.</li></ol>
    <div>Total Time: 1 hour hour 5 minutes minutes Servings: 3 Prep time: 30 minutes</div></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.total_time_minutes == 65
    assert recipe.total_time_text == "1 hour hour 5 minutes"


@pytest.mark.asyncio
async def test_html_extractor_reads_recipe_card_metadata_and_component_labels() -> None:
    html = """
    <main><header class="tasty-recipes-header"><ul><li>Total Time: 50 minutes</li><li>Yield: 3–4 servings</li></ul></header>
    <h3>Ingredients</h3><p>For the Sheet Pan:</p><ul><li>1 potato</li></ul><p>Lemon Herb Sauce:</p><ul><li>1 lemon</li></ul>
    <h3>Instructions</h3><ol><li>Cook.</li></ol>
    <script type="application/ld+json">{"@type":"Recipe","nutrition":{"calories":"646 calories","proteinContent":"55.6 g","fatContent":"37.4 g","carbohydrateContent":"25.5 g"}}</script>
    </main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.total_time_minutes == 50
    assert recipe.yield_servings == "3"
    assert recipe.nutrition and recipe.nutrition.calories == "646"
    assert [component.name for component in recipe.components if component.ingredients] == ["For the Sheet Pan", "Lemon Herb Sauce"]


@pytest.mark.asyncio
async def test_html_extractor_uses_standalone_strong_labels_as_ingredient_groups() -> None:
    html = """
    <main><h3>Ingredients</h3><strong>For the Sheet Pan:</strong><ul><li>1 potato</li></ul>
    <strong>Lemon Herb Sauce:</strong><ul><li>1 lemon</li></ul>
    <h3>Instructions</h3><ol><li>Cook.</li></ol></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [component.name for component in recipe.components if component.ingredients] == [
        "For the Sheet Pan", "Lemon Herb Sauce",
    ]


@pytest.mark.asyncio
async def test_html_extractor_names_an_unnamed_first_ingredient_group_main() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 chicken breast</li></ul>
    <strong>Sauce:</strong><ul><li>1 lemon</li></ul>
    <h3>Instructions</h3><ol><li>Cook.</li></ol></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [component.name for component in recipe.components] == ["Main", "Sauce", None]


@pytest.mark.asyncio
async def test_html_extractor_reads_bbc_good_food_embedded_recipe_payload() -> None:
    html = '''<script id="__POST_CONTENT__" type="application/json">{"client":"bbcgoodfood","title":"Soup","servings":"Serves 4","cookAndPrepTime":{"total":4500},"ingredients":[{"ingredients":[{"quantityText":"1","ingredientText":"beetroot","note":"diced"}]},{"heading":"For the topping","ingredients":[{"quantityText":"100g","ingredientText":"feta"}]}],"methodSteps":[{"content":[{"data":{"value":"<p>Cook the beetroot.</p>"}}]}],"nutritions":[{"label":"kcal","value":403},{"label":"fat","value":13},{"label":"carbs","value":52},{"label":"protein","value":15}]}</script>'''
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.yield_servings == "4"
    assert recipe.total_time_minutes == 75
    assert [component.name for component in recipe.components] == ["Main", "For the topping", None]
    assert [item.text for item in recipe.components[0].ingredients] == ["1 beetroot diced"]
    assert [step.text for step in recipe.components[2].steps] == ["Cook the beetroot."]


@pytest.mark.asyncio
async def test_html_extractor_prefers_jsonld_nutrition_and_reads_makes_yield() -> None:
    html = '''
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Instructions</h3><ol><li>Cook.</li></ol>
    <h3>Nutrition per serving</h3><p>Calories 4% Fat 3% Protein 7% Carbohydrates 5%</p>
    <script type="application/ld+json">{"@type":"Recipe","recipeYield":"Makes 12","nutrition":{"calories":"78.6 calories","proteinContent":"3.7 g","fatContent":"2.1 g","carbohydrateContent":"12.2 g"}}</script>
    </main>'''
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.yield_servings == "12"
    assert recipe.nutrition.calories == "79"
    assert recipe.nutrition.protein == "3.7"
    assert recipe.nutrition.fat == "2.1"
    assert recipe.nutrition.carbohydrates == "12.2"


@pytest.mark.asyncio
async def test_html_extractor_skips_recommendations_between_ingredients_and_directions() -> None:
    html = """
    <main><h2>Ingredients</h2><ul><li>1 onion</li></ul><h2>You'll Also Love:</h2>
    <h3>Other soup</h3><h2>Directions</h2><ol><li>Cook the onion.</li></ol></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [item.text for item in recipe.components[0].ingredients] == ["1 onion"]
    assert [step.text for step in recipe.components[0].steps] == ["Cook the onion."]


@pytest.mark.asyncio
async def test_html_extractor_ignores_shopping_card_lines_in_directions() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Directions</h3>
    <ol><li>Cook the onion.</li><li>BUY NOW Pan, $30; amazon.com</li></ol></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [step.text for step in recipe.components[0].steps] == ["Cook the onion."]


@pytest.mark.asyncio
async def test_html_extractor_removes_leading_step_numbers_from_instruction_text() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Directions</h3>
    <ol><li>Step 1 Preheat the oven.</li><li>Step 2 : Cook the onion.</li><li>Step 3: Serve.</li></ol></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [step.text for step in recipe.components[0].steps] == ["Preheat the oven.", "Cook the onion.", "Serve."]


@pytest.mark.asyncio
async def test_html_extractor_groups_duplicate_for_the_labels_and_ignores_top_tip_and_tags() -> None:
    html = """
    <main><h3>Ingredients</h3><p>For the paste</p><p>For the paste</p><ul><li>1 tbsp tahini</li></ul>
    <p>For the pork</p><p>For the pork</p><ul><li>200g pork mince</li></ul>
    <h5>Top Tip</h5><p>This is editorial advice.</p><h3>Method</h3><ol><li>Cook the pork.</li></ol><p>Tags</p></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [component.name for component in recipe.components] == ["For the paste", "For the pork", None]
    assert [item.text for item in recipe.components[0].ingredients] == ["1 tbsp tahini"]
    assert [item.text for item in recipe.components[1].ingredients] == ["200g pork mince"]
    assert [step.text for step in recipe.components[2].steps] == ["Cook the pork."]


@pytest.mark.asyncio
async def test_html_extractor_uses_leading_yield_count_when_the_unit_is_named() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Instructions</h3><ol><li>Cook.</li></ol>
    <div>Yield: 1 burger</div></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.yield_text == "1 burger"
    assert recipe.yield_servings == "1"


@pytest.mark.asyncio
async def test_html_extractor_uses_recipe_servings_control_value() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Instructions</h3><ol><li>Cook.</li></ol>
    <div>Serves 1</div><span class="wprm-recipe-servings wprm-recipe-servings-31673"
        data-recipe="31673" aria-label="Adjust recipe servings">4</span></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.yield_text == "4"
    assert recipe.yield_servings == "4"


@pytest.mark.asyncio
async def test_html_extractor_combines_nested_step_heading_with_its_instruction() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 chicken breast</li></ul><h3>Instructions</h3>
    <h4>Step 1: Prepare the Chicken</h4><p>Flatten the chicken until even.</p><p>Season it with salt.</p>
    <h4>Step 2: Cook</h4><p>Cook until golden.</p></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert len(recipe.components[0].steps) == 2
    assert recipe.components[0].steps[0].text.startswith("Prepare the Chicken")
    assert "Season it with salt." in recipe.components[0].steps[0].text
    assert len(recipe.components[0].steps[0].references) == 3


@pytest.mark.asyncio
async def test_html_extractor_combines_a_nested_instruction_title_with_its_first_step() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 chicken breast</li></ul><h3>Instructions</h3>
    <h4>Prepare the chicken</h4><p>Flatten the chicken until even.</p><p>Season it with salt.</p></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert len(recipe.components[0].steps) == 2
    assert recipe.components[0].steps[0].text.startswith("Prepare the chicken")
    assert recipe.components[0].steps[0].text.endswith("Flatten the chicken until even.")
    assert recipe.components[0].steps[1].text == "Season it with salt."


@pytest.mark.asyncio
async def test_html_extractor_stops_before_a_trailing_nutrition_table() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Instructions</h3>
    <p>Cook the onion.</p><div>Calories</div><div>400</div><div>Fat</div><div>20%</div></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [step.text for step in recipe.components[0].steps] == ["Cook the onion."]


@pytest.mark.asyncio
async def test_html_extractor_ignores_recipe_card_last_step_label() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Instructions</h3>
    <p>Cook the onion.</p><p>Last step!</p></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [step.text for step in recipe.components[0].steps] == ["Cook the onion."]


@pytest.mark.asyncio
async def test_html_extractor_ignores_recipe_card_review_prompt() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 onion</li></ul><h3>Instructions</h3>
    <p>Cook the onion.</p><p>Last Step! Please leave a review and rating letting us know how you liked it.</p></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [step.text for step in recipe.components[0].steps] == ["Cook the onion."]


@pytest.mark.asyncio
async def test_html_extractor_does_not_mix_a_secondary_recipe_into_primary_partial_recipe() -> None:
    html = """
    <main><h1>Primary soup</h1><h2>Ingredients</h2><ul><li>1 onion</li></ul>
    <h2>Secondary pasta</h2><h3>Ingredients</h3><ul><li>500 g pasta</li></ul>
    <h3>Instructions</h3><ol><li>Cook pasta.</li></ol></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [item.text for item in recipe.components[0].ingredients] == ["1 onion"]
    assert recipe.components[0].steps == []


@pytest.mark.asyncio
async def test_unheaded_promotion_and_numbers_are_not_recipe_content() -> None:
    recipe = await RecipeEvidenceExtractor().extract_text(ExtractionInput(
        content="Sponsored post\n500 calories\n2026-01-01\nhttps://example.com", evidence_ids=["source"],
    ))

    assert recipe.components == []


@pytest.mark.asyncio
async def test_text_extractor_accepts_unicode_bullets() -> None:
    recipe = await RecipeEvidenceExtractor().extract_text(ExtractionInput(
        content="Ingredients:\n• 1 onion\nInstructions:\n• Cook.", evidence_ids=["source"],
    ))

    assert recipe.components[0].ingredients[0].text == "1 onion"


@pytest.mark.asyncio
async def test_text_extractor_skips_standalone_list_markers() -> None:
    recipe = await RecipeEvidenceExtractor().extract_text(ExtractionInput(
        content="Ingredients:\n\u2022\n- 1 onion\nInstructions:\nCook.", evidence_ids=["source"],
    ))

    assert [item.text for item in recipe.components[0].ingredients] == ["1 onion"]


@pytest.mark.asyncio
async def test_real_extractor_completes_social_caption_without_fallbacks() -> None:
    class EnglishDetector:
        def detect(self, text: str) -> LanguageResult:
            return LanguageResult(code="en", confidence=0.99)

    outcome = await ExtractionOrchestrator(ExtractionDependencies(RecipeEvidenceExtractor(), EnglishDetector())).extract({
        "schema_version": 1,
        "kind": "social",
        "source_url": "https://www.instagram.com/reel/example/",
        "capture": {"status": "complete", "errors": []},
        "scrapecreators_response": {"data": {"xdt_shortcode_media": {
            "edge_media_to_caption": {"edges": [{"node": {"text": "Ingredients:\n- 1 onion\nInstructions:\n1. Cook the onion."}}]},
            "owner": {"username": "carrotcook"},
        }}},
        "comments": [],
        "audio": {"status": "unavailable"},
    })

    assert outcome.outcome == "complete"
    assert outcome.recipe.components[0].ingredients[0].evidence_ids == ["caption:0"]
    assert outcome.recipe.components[0].steps[0].evidence_ids == ["caption:0"]


@pytest.mark.asyncio
async def test_orchestrator_resolves_relative_component_links_and_drops_unsafe_ones() -> None:
    class EnglishDetector:
        def detect(self, text: str) -> LanguageResult:
            return LanguageResult(code="en", confidence=0.99)

    outcome = await ExtractionOrchestrator(ExtractionDependencies(RecipeEvidenceExtractor(), EnglishDetector())).extract({
        "schema_version": 1, "kind": "html", "source_url": "https://example.com/recipes/soup",
        "capture": {"status": "complete", "errors": []},
        "html": "<main><h2>Ingredients</h2><ul><li><a href='/sauce'>Sauce</a></li><li><a href='javascript:alert(1)'>Bad</a></li></ul><h2>Instructions</h2><ol><li>Cook.</li></ol></main>",
    })

    assert outcome.outcome == "complete"
    ingredients = outcome.recipe.components[0].ingredients
    assert ingredients[0].link_url == "https://example.com/sauce"
    assert ingredients[1].links == []
    assert ingredients[1].link_url is None
@pytest.mark.asyncio
async def test_html_extractor_reads_properly_encoded_polish_recipe_sections_and_yield() -> None:
    html = """
    <h1>Confirm our vendors</h1><main><h1>Danie jednogarnkowe z mielonym mięsem, papryką i ryżem</h1>
    <h3>Składniki</h3><p>4 porcje</p><ul><li>2 łyżki oliwy</li></ul>
    <h3>Przygotowanie</h3><ol><li>Podsmaż mięso.</li></ol></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.title == "Danie jednogarnkowe z mielonym mięsem, papryką i ryżem"
    assert recipe.yield_servings == "4"
    assert [item.text for item in recipe.components[0].ingredients] == ["2 łyżki oliwy"]
    assert [step.text for step in recipe.components[0].steps] == ["Podsmaż mięso."]


@pytest.mark.asyncio
async def test_html_extractor_ignores_recipe_title_repeated_as_an_image_caption() -> None:
    html = """
    <main><h1>Tomato soup</h1><h3>Ingredients</h3><ul><li>1 tomato</li></ul>
    <h3>Instructions</h3><ol><li>Cook the tomato.</li></ol><p>Tomato soup</p></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [step.text for step in recipe.components[0].steps] == ["Cook the tomato."]


@pytest.mark.asyncio
async def test_html_extractor_reads_polish_yield_ranges_and_highlighted_groups() -> None:
    html = """
    <main><h3>Składniki</h3><p>2 - 3 porcje</p><ul><li>1 kg żeberek</li></ul>
    <div class="wyroznione">Do podania np.</div><ul><li>100 g ryżu</li></ul>
    <div class="wyroznione">Sos koreański</div><ul><li>2 łyżki sosu sojowego</li></ul>
    <h3>Przygotowanie</h3><ol><li>Upiecz żeberka.</li></ol></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.yield_servings == "2"
    assert [component.name for component in recipe.components] == ["Main", "Do podania np.", "Sos koreański", None]


@pytest.mark.asyncio
async def test_html_extractor_groups_duplicated_for_topping_label() -> None:
    html = """
    <main><h3>Ingredients</h3><ul><li>1 chicken thigh</li></ul>
    <p>For Topping (finishing the dish)</p><p>For Topping (finishing the dish)</p><ul><li>¼ cup mint</li></ul>
    <h3>Instructions</h3><ol><li>Roast the chicken.</li></ol></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [component.name for component in recipe.components] == ["Main", "For Topping (finishing the dish)", None]


@pytest.mark.asyncio
async def test_html_extractor_skips_equipment_between_ingredients_and_german_preparation() -> None:
    html = """
    <main><h3>Zutaten</h3><ul><li>700 g Hähnchen</li></ul><h3>Zubehör</h3><ul><li>Holzspieße</li></ul>
    <h3>Zubereitung</h3><ol><li>Das Hähnchen schneiden.</li></ol></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert [item.text for item in recipe.components[0].ingredients] == ["700 g Hähnchen"]
    assert [step.text for step in recipe.components[0].steps] == ["Das Hähnchen schneiden."]


@pytest.mark.asyncio
async def test_html_extractor_reads_ploetzblog_ingredient_overview() -> None:
    html = """
    <main><h1>Fladenbrot</h1><div><h4>Zutatenübersicht</h4>Ursprungsrezept für 3 Stück
    <table><tr><td>413 g</td><td>Weizenmehl 550</td><td>100 %</td></tr><tr><td>186 g</td><td>Wasser</td><td>45 %</td></tr><tr><td></td><td>schwarzer Sesam</td></tr></table></div></main>
    """
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html"]))

    assert recipe.yield_servings == "3"
    assert [item.text for item in recipe.components[0].ingredients] == ["413 g Weizenmehl 550", "186 g Wasser", "schwarzer Sesam"]


def test_extracted_recipe_defaults_to_empty_nutrition() -> None:
    nutrition = ExtractedRecipe().nutrition

    assert nutrition.calories is None
    assert nutrition.protein is None
    assert nutrition.fat is None
    assert nutrition.carbohydrates is None
