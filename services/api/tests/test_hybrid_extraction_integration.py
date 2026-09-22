"""Hybrid selections remain usable by the real v2 fallback/merge workflow."""

from __future__ import annotations

import pytest

from api.services.extraction_v2.contracts import LanguageResult, TextSelection
from api.services.extraction_v2.evidence import reference_matches
from api.services.extraction_v2.extractor import RecipeEvidenceExtractor
from api.services.extraction_v2.gemini_selection import HybridTextExtractor
from api.services.extraction_v2.orchestrator import ExtractionDependencies, ExtractionOrchestrator
from api.services.extraction_v2.sources import LinkedPage


class English:
    def detect(self, text):
        return LanguageResult(code="en", confidence=1)


class CaptionSelector:
    calls = 0

    async def select(self, source):
        self.calls += 1
        return TextSelection.model_validate({
            "components": [{"ingredient_line_ids": ["line:2", "line:4"]}],
            "yield_line_ids": ["line:1"],
            "nutrition": {
                "line_ids": ["line:5", "line:6"],
                "basis": "per_serving",
                "basis_quote": {"line_id": "line:5", "quote": "Per serving"},
                "calories": {"line_id": "line:6", "quote": "250 kcal"},
                "protein": {"line_id": "line:6", "quote": "10 g"},
            },
        })


def payload(caption: str) -> dict:
    return {
        "schema_version": 1, "kind": "social",
        "source_url": "https://www.instagram.com/reel/example/",
        "capture": {"status": "complete", "errors": []},
        "scrapecreators_response": {"data": {"xdt_shortcode_media": {
            "edge_media_to_caption": {"edges": [{"node": {"text": caption}}]},
            "owner": {"username": "cook"},
        }}},
        "comments": [], "audio": {"status": "unavailable"},
    }


CAPTION = "Serves 2\nsalt to taste\nFollow for more!\nyogurt\nPer serving\n250 kcal; protein 10 g"


@pytest.mark.asyncio
async def test_selected_ingredients_and_nutrition_remain_incomplete_without_instructions():
    selector = CaptionSelector()
    outcome = await ExtractionOrchestrator(ExtractionDependencies(
        HybridTextExtractor(RecipeEvidenceExtractor(), selector), English(),
    )).extract(payload(CAPTION))

    assert outcome.outcome == "incomplete"
    assert outcome.issue_codes == ["MISSING_INSTRUCTIONS"]
    assert [item.text for item in outcome.recipe.components[0].ingredients] == ["salt to taste", "yogurt"]
    assert (outcome.recipe.yield_text, outcome.recipe.yield_servings) == ("Serves 2", "2")
    assert outcome.recipe.nutrition.calories == "250"
    assert all(reference_matches(ref, CAPTION) for ref in outcome.recipe.nutrition.references)
    assert selector.calls == 1


@pytest.mark.asyncio
async def test_linked_html_fills_steps_without_losing_caption_nutrition_or_calling_selector_again():
    url = "https://example.com/recipe"

    class Pages:
        calls = 0

        async def fetch(self, requested):
            assert requested == url
            self.calls += 1
            return LinkedPage(url, url, "<h2>Instructions</h2><p>Mix and serve.</p>")

    selector, pages = CaptionSelector(), Pages()
    outcome = await ExtractionOrchestrator(ExtractionDependencies(
        HybridTextExtractor(RecipeEvidenceExtractor(), selector), English(), pages,
    )).extract(payload(f"{CAPTION}\n{url}"))

    assert outcome.outcome == "complete"
    assert [step.text for group in outcome.recipe.components for step in group.steps] == ["Mix and serve."]
    assert (outcome.recipe.yield_text, outcome.recipe.yield_servings) == ("Serves 2", "2")
    assert outcome.recipe.nutrition.calories == "250"
    assert outcome.recipe.nutrition.protein == "10"
    assert selector.calls == pages.calls == 1
