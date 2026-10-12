from __future__ import annotations

import pytest

from api.services.extraction_v2.contracts import ExtractionInput, TextSelection
from api.services.extraction_v2.evidence import reference_matches
from api.services.extraction_v2.extractor import RecipeEvidenceExtractor
from api.services.extraction_v2.gemini_selection import HybridTextExtractor
from api.services.extraction_v2.lexicons import clean_component_name


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("🍊 calda ", "Calda"),
        ("🍊ingredientes ", None),
        ("**Frosting:**", "Frosting"),
        ("— Für den Teig —", "Für den Teig"),
        ("Ingredienti:", None),
        ("🥕🥕 Sopa", "Sopa"),
        ("👩🏽‍🍳 Massa", "Massa"),
        ("❤️ Ingredients:", None),
        ("# Zutaten |", None),
        ("• Préparation :", None),
        ("Modo de preparo", None),
        ("Ingredientes (8 porções)", None),
        ("🍊🍊", None),
        ("   ", None),
        # Specific names stay unchanged.
        ("Sauce", "Sauce"),
        ("For the glaze", "For the glaze"),
        ("Massa", "Massa"),
        ("Ciasto na spód", "Ciasto na spód"),
        ("Crème pâtissière", "Crème pâtissière"),
        ("Ingredients for the sauce", "Ingredients for the sauce"),
        ("Tarta de 2 sabores", "Tarta de 2 sabores"),
    ],
)
def test_clean_component_name(raw: str, expected: str | None) -> None:
    assert clean_component_name(raw) == expected


@pytest.mark.asyncio
async def test_text_extractor_cleans_decorated_caption_headings() -> None:
    content = (
        "🍊ingredientes:\n- 2 xícaras de farinha\n🍊 calda:\n- 1 xícara de açúcar\n"
        "🥕🥕 Sopa:\n- 2 cenouras\n**Frosting:**\n- 100 g butter\n"
        "Modo de preparo:\n1. Misture e asse."
    )
    recipe = await RecipeEvidenceExtractor().extract_text(ExtractionInput(content=content, evidence_ids=["caption"]))

    names = [component.name for component in recipe.components if component.ingredients]
    assert names == [None, "Calda", "Sopa", "Frosting"] or names == ["Main", "Calda", "Sopa", "Frosting"]
    assert all(not any(ch in (component.name or "") for ch in "🍊🥕*:") for component in recipe.components)


class _SelectorResponse:
    """Stands in for the Gemini selection response (same pattern as test_gemini_text_selection.py)."""

    def __init__(self, result: TextSelection) -> None:
        self.result = result

    async def select(self, source) -> TextSelection:
        return self.result


@pytest.mark.asyncio
async def test_gemini_selection_cleans_decorated_headings_and_drops_generic_ones() -> None:
    source = ExtractionInput(
        content="🍊ingredientes \n2 xícaras de farinha\n🍊 calda \n1 xícara de açúcar",
        evidence_ids=["caption:0"],
    )
    selector = _SelectorResponse(TextSelection.model_validate({
        "components": [
            {"heading_id": "line:1", "ingredient_line_ids": ["line:2"]},
            {"heading_id": "line:3", "ingredient_line_ids": ["line:4"]},
        ],
    }))

    recipe = await HybridTextExtractor(RecipeEvidenceExtractor(), selector).extract_text(source)

    assert [component.name for component in recipe.components] == [None, "Calda"]
    assert [item.text for item in recipe.components[0].ingredients] == ["2 xícaras de farinha"]
    assert [item.text for item in recipe.components[1].ingredients] == ["1 xícara de açúcar"]
    assert recipe.components[0].name_references == []
    assert reference_matches(recipe.components[1].name_references[0], source.content)
