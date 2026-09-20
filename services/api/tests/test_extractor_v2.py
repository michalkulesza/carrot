from __future__ import annotations

import pytest

from api.services.extraction_v2.contracts import ExtractionInput
from api.services.extraction_v2.evidence import reference_matches
from api.services.extraction_v2.extractor import RecipeEvidenceExtractor
from api.services.extraction_v2.contracts import LanguageResult
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
    assert "Season it with salt." in recipe.components[0].steps[0].text
    assert len(recipe.components[0].steps[0].references) == 3


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
