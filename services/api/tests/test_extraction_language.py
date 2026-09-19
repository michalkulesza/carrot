import pytest

from api.services.extraction_v2.language import LinguaLanguageDetector


@pytest.mark.parametrize(("text", "expected"), [
    ("Ingredients: two carrots. Cook until the carrots are tender and serve warm.", "en"),
    ("Zutaten: zwei Karotten. Kochen Sie die Karotten weich und servieren Sie sie warm.", "de"),
    ("Składniki: dwie marchewki. Gotuj marchewki do miękkości i podawaj na ciepło.", "pl"),
    ("Ingrédients : deux carottes. Faites cuire les carottes jusqu'à ce qu'elles soient tendres.", "fr"),
    ("Ingredientes: dos zanahorias. Cocine las zanahorias hasta que estén tiernas y sirva caliente.", "es"),
])
def test_lingua_detects_supported_recipe_languages(text: str, expected: str) -> None:
    assert LinguaLanguageDetector().detect(text).code == expected


def test_lingua_returns_unknown_for_short_language_neutral_text() -> None:
    assert LinguaLanguageDetector().detect("1 tsp salt").code is None
