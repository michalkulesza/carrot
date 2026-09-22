"""Small, source-wording-preserving clue tables for supported languages."""

from __future__ import annotations

import re

INGREDIENT_HEADINGS = {
    "składniki", "składniki na",
    "ingredients", "ingredient", "składniki", "składniki na", "zutaten", "ingrédients", "ingredientes",
}
INSTRUCTION_HEADINGS = {
    "instructions", "directions", "method", "preparation", "steps", "preparation", "przygotowanie", "wykonanie",
    "instrukcje", "zubereitung", "anleitung", "schritte", "préparation", "instructions", "preparación", "pasos",
}
NON_RECIPE_HEADINGS = {"nutrition", "nutrition facts", "notes", "comments", "reviews", "advertisement", "advertising"}
COOKING_VERBS = {
    "cook", "bake", "fry", "boil", "mix", "stir", "heat", "serve", "add", "pour", "roast", "simmer",
    "ugotuj", "piec", "smaż", "wymieszaj", "dodaj", "podawaj", "kochen", "backen", "braten", "mischen",
    "hinzufügen", "servieren", "cuire", "mélanger", "ajouter", "servir", "hornear", "freír", "mezclar", "añadir", "servir",
}

_QUANTITY = re.compile(r"^(?:[~≈]?\s*)?(?:\d+(?:[.,/]\d+)?|¼|½|¾|one|two|half|a)\b", re.IGNORECASE)
_UNIT = re.compile(r"\b(?:g|kg|ml|l|oz|lb|tsp|tbsp|cup|cups|pinch|clove|cloves|szklanka|lyżka|gram|gramm|el|tl|tasse|cuillère)\b", re.IGNORECASE)


def heading_kind(text: str) -> str | None:
    normalized = re.sub(r"\s+", " ", text).strip().casefold().rstrip(":")
    if normalized in INGREDIENT_HEADINGS:
        return "ingredients"
    if normalized in INSTRUCTION_HEADINGS:
        return "instructions"
    if normalized in NON_RECIPE_HEADINGS or normalized.startswith("nutritional analysis"):
        return "stop"
    return None


def looks_like_ingredient(text: str) -> bool:
    normalized = text.strip()
    return bool(_QUANTITY.search(normalized) or _UNIT.search(normalized) or re.search(r"\b(?:to taste|as needed|do smaku|nach geschmack|al gusto)\b", normalized, re.I))


def looks_like_step(text: str) -> bool:
    words = set(re.findall(r"[^\W\d_]+", text.casefold()))
    return bool(words & COOKING_VERBS)
