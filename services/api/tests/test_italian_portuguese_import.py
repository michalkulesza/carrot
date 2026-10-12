"""Italian and Portuguese import support: language gate, lexicon, extractor labels, parser units, prompts, preferences."""

import pytest
from pydantic import ValidationError

from api.models import UserPreferencesUpdate
from api.services import gemini
from api.services.extraction_v2 import gemini_selection
from api.services.extraction_v2.contracts import ExtractionInput, LanguageResult
from api.services.extraction_v2.extractor import (
    RecipeEvidenceExtractor, _total_time_minutes, parse_nutrition_text, parse_yield_servings,
)
from api.services.extraction_v2.language import SUPPORTED_LANGUAGE_CODES, LinguaLanguageDetector, html_lang_fallback
from api.services.extraction_v2.lexicons import heading_kind, looks_like_ingredient, looks_like_step
from api.services.ingredient_parser_v2 import parse_ingredient
from api.services.unit_variants import convert_ingredient


@pytest.mark.parametrize(("text", "expected"), [
    ("Ingredienti: due carote. Cuocete le carote finché non sono tenere e servite calde.", "it"),
    ("Ingredientes: duas cenouras. Cozinhe as cenouras até ficarem macias e sirva quente.", "pt"),
])
def test_lingua_detects_italian_and_portuguese(text: str, expected: str) -> None:
    assert LinguaLanguageDetector().detect(text).code == expected


def test_allow_list_and_html_lang_fallback_accept_it_and_pt() -> None:
    assert {"it", "pt"} <= SUPPORTED_LANGUAGE_CODES
    for lang, code in (("it-IT", "it"), ("pt-BR", "pt"), ("pt_PT", "pt")):
        assert html_lang_fallback(LanguageResult(), f'<html lang="{lang}"></html>').code == code


@pytest.mark.parametrize(("heading", "kind"), [
    ("Ingredienti", "ingredients"), ("Ingredienti:", "ingredients"), ("Dosi & Ingredienti", "ingredients"),
    ("Ingredientes (8 porções)", "ingredients"),
    ("Preparazione", "instructions"), ("Procedimento", "instructions"), ("Istruzioni", "instructions"),
    ("Come preparare il Tiramisù", "instructions"),
    ("Modo de preparo", "instructions"), ("Modo de Preparação", "instructions"), ("Preparo", "instructions"),
    ("Instruções", "instructions"), ("Como fazer bolo", "instructions"),
])
def test_italian_and_portuguese_headings(heading: str, kind: str) -> None:
    assert heading_kind(heading) == kind


@pytest.mark.parametrize("text", [
    "sale q.b.", "Sale quanto basta", "pimenta a gosto", "1 cucchiaio di olio", "2 colheres de sopa de açúcar", "1 xícara de leite",
])
def test_looks_like_ingredient_italian_portuguese(text: str) -> None:
    assert looks_like_ingredient(text)


@pytest.mark.parametrize("text", ["Mescolate bene e infornate.", "Misture bem e asse por 40 minutos."])
def test_looks_like_step_italian_portuguese(text: str) -> None:
    assert looks_like_step(text)


@pytest.mark.parametrize(("value", "expected"), [
    ("Dosi per 6 persone", "6"), ("Porzioni: 4", "4"), ("8 porzioni", "8"), ("4 persone", "4"),
    ("Rende 12 porções", "12"), ("Rendimento: 10", "10"), ("Serve 4 pessoas", "4"), ("6 pessoas", "6"), ("8 porções", "8"),
])
def test_yield_italian_portuguese(value: str, expected: str) -> None:
    assert parse_yield_servings(value) == expected


@pytest.mark.parametrize(("value", "minutes"), [
    ("1 ora e 30 minuti", 90), ("2 ore", 120), ("45 minuti", 45), ("1 hora e 15 minutos", 75), ("2 horas", 120),
])
def test_time_amounts_italian_portuguese(value: str, minutes: int) -> None:
    assert _total_time_minutes(value) == minutes


@pytest.mark.parametrize("text", [
    "Per porzione: 320 calorie, 12 g proteine, 10 g grassi, 40 g carboidrati",
    "Por porção: 320 calorias, 12 g proteínas, 10 g gorduras, 40 g carboidratos",
    "Por pessoa: 320 calorias, 12 g proteínas, 10 g gorduras, 40 g hidratos de carbono",
])
def test_nutrition_labels_italian_portuguese(text: str) -> None:
    nutrition = parse_nutrition_text(text)
    assert (nutrition.calories, nutrition.protein, nutrition.fat, nutrition.carbohydrates) == ("320", "12", "10", "40")


@pytest.mark.asyncio
async def test_html_extractor_reads_italian_total_time_and_nutrition_labels() -> None:
    html = """<main><h1>Torta</h1><h2>Ingredienti</h2><ul><li>2 uova</li></ul>
    <h2>Preparazione</h2><ol><li>Mescolate.</li></ol>
    <p>Tempo totale: 1 ora e 15 minuti</p>
    <h3>Valori nutrizionali</h3><p>Calorie: 221 kcal | Carboidrati: 34 g | Proteine: 2 g | Grassi: 9 g</p></main>"""
    recipe = await RecipeEvidenceExtractor().extract_html(ExtractionInput(content=html, evidence_ids=["html:0"]))
    assert recipe.total_time_minutes == 75
    n = recipe.nutrition
    assert (n.calories, n.protein, n.fat, n.carbohydrates) == ("221", "2", "9", "34")


@pytest.mark.asyncio
async def test_text_extractor_reads_portuguese_caption() -> None:
    content = "Rende 8 porções\nIngredientes:\n- 2 xícaras de farinha\n- sal a gosto\nModo de preparo:\n1. Misture tudo.\n2. Asse por 40 minutos."
    recipe = await RecipeEvidenceExtractor().extract_text(ExtractionInput(content=content, evidence_ids=["s"]))
    assert recipe.yield_servings == "8"
    assert [i.text for i in recipe.components[0].ingredients] == ["2 xícaras de farinha", "sal a gosto"]
    assert len(recipe.components[-1].steps) == 2


@pytest.mark.parametrize(("source", "qty", "unit", "name"), [
    ("2 cucchiai di olio", "2", "tbsp", "olio"),
    ("1 cucchiaino di sale", "1", "tsp", "sale"),
    ("1 e 1/2 tazze di latte", "1 1/2", "cup", "latte"),
    ("1 bicchiere di vino", "1", "bicchiere", "vino"),
    ("200 g di farina 00", "200", "g", "farina 00"),
    ("2 chili di patate", "2", "kg", "patate"),
    ("1,5 litri di brodo", "1.5", "l", "brodo"),
    ("2 spicchi d'aglio", "2", "clove", "aglio"),
    ("1 pizzico di sale", "1", "pinch", "sale"),
    ("2 colheres de sopa de açúcar", "2", "tbsp", "açúcar"),
    ("1 colher (chá) de fermento", "1", "tsp", "fermento"),
    ("1 colher de café de sal", "1", "tsp", "sal"),
    ("1 xícara de leite", "1", "cup", "leite"),
    ("2 chávenas de farinha", "2", "cup", "farinha"),
    ("3 copos de água", "3", "copo", "água"),
    ("500 gramas de batata", "500", "g", "batata"),
    ("2 quilos de carne", "2", "kg", "carne"),
    ("1 litro de leite", "1", "l", "leite"),
    ("1 pitada de sal", "1", "pinch", "sal"),
    ("2 dentes de alho", "2", "clove", "alho"),
])
def test_parser_italian_portuguese_units(source: str, qty: str, unit: str, name: str) -> None:
    parsed = parse_ingredient(source)
    assert (parsed.qty, parsed.unit, parsed.name) == (qty, unit, name)


def test_parser_keeps_etto_as_partial_unit_and_amountless_lines_uncertain() -> None:
    etto = parse_ingredient("1 etto di burro")
    assert (etto.qty, etto.unit, etto.name, etto.status) == ("1", "etto", "burro", "partial")
    assert parse_ingredient("sale q.b.").status == "uncertain"
    assert parse_ingredient("pimenta a gosto").status == "uncertain"


def test_unit_variants_convert_italian_and_portuguese_measures() -> None:
    assert convert_ingredient("500 grammi di farina", "imperial") == "1.1 lb di farina"
    assert convert_ingredient("2 chili di patate", "imperial") == "4.4 lb di patate"
    assert convert_ingredient("2 quilos de batata", "imperial") == "4.4 lb de batata"
    assert convert_ingredient("1 litro de leite", "imperial").startswith("1.1 qt")


def test_gemini_prompts_name_italian_and_portuguese() -> None:
    for prompt in (gemini._TRANSCRIPTION_SYSTEM, gemini_selection._SELECTION_SYSTEM):
        assert "Italian" in prompt and "Portuguese" in prompt
    assert "never translate" in gemini._TRANSCRIPTION_SYSTEM


@pytest.mark.parametrize("code", ["en", "pl", "de", "fr", "es", "it", "pt"])
def test_preferences_accept_supported_languages(code: str) -> None:
    assert UserPreferencesUpdate(language=code).language == code


@pytest.mark.parametrize("code", ["xx", "pt-BR", "tr", ""])
def test_preferences_reject_unknown_languages(code: str) -> None:
    with pytest.raises(ValidationError):
        UserPreferencesUpdate(language=code)


def test_preferences_language_is_optional() -> None:
    assert UserPreferencesUpdate().language is None
