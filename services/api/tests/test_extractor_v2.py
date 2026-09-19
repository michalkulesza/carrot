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
