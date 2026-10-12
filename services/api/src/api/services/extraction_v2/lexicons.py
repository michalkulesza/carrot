"""Small, source-wording-preserving clue tables for supported languages."""

from __future__ import annotations

import re
import unicodedata

INGREDIENT_HEADINGS = {
    "składniki", "składniki na",
    "ingredients", "ingredient", "składniki", "składniki na", "zutaten", "ingrédients", "ingredientes",
    "ingredienti", "ingrediente", "dosi & ingredienti", "dosi e ingredienti", "ingredientes e modo de preparo", "ingredientes para",
}
INSTRUCTION_HEADINGS = {
    "instructions", "directions", "method", "preparation", "steps", "preparation", "przygotowanie", "wykonanie",
    "instrukcje", "zubereitung", "anleitung", "schritte", "préparation", "instructions", "preparación", "pasos",
    "preparazione", "procedimento", "istruzioni", "modo de preparo", "modo de preparação", "modo de fazer", "preparo", "preparação",
    "instruções", "passo a passo", "método de preparo", "método de preparação", "modo de preparacao", "modo de preparaçao",
}
INSTRUCTION_HEADING_PREFIXES = ("come preparare", "come si prepara", "como fazer", "como preparar", "modo de preparo", "modo de fazer")
NON_RECIPE_HEADINGS = {"nutrition", "nutrition facts", "notes", "comments", "reviews", "advertisement", "advertising"}
ABBREVIATED_GROUP_LABELS = re.compile(
    r"^(?:(?:the\s+)?(?:abbreviated|short(?:ened)?|quick|condensed|summary|brief)(?:\s+(?:version|recipe|method|instructions|directions))?"
    r"|(?:recipe\s+)?summary|tl;?dr|recipe\s+in\s+brief|in\s+brief)$"
)
FULL_GROUP_LABELS = re.compile(
    r"^(?:(?:the\s+)?(?:full|complete|detailed|long|extended)(?:\s+(?:version|recipe|method|instructions|directions))?"
    r"|(?:full|complete|detailed)\s+(?:step[- ]by[- ]step\s+)?(?:recipe|instructions|directions|method))$"
)
COOKING_VERBS = {
    "cook", "bake", "fry", "boil", "mix", "stir", "heat", "serve", "add", "pour", "roast", "simmer",
    "ugotuj", "piec", "smaż", "wymieszaj", "dodaj", "podawaj", "kochen", "backen", "braten", "mischen",
    "hinzufügen", "servieren", "cuire", "mélanger", "ajouter", "servir", "hornear", "freír", "mezclar", "añadir", "servir",
    "cuoci", "cuocere", "cuocete", "mescola", "mescolare", "mescolate", "aggiungi", "aggiungere", "aggiungete", "versa", "versare", "infornare", "inforna",
    "friggere", "bollire", "lessare", "scaldare", "impasta", "impastare", "sbatti", "sbattere", "montare", "servi", "servire", "unisci", "unire",
    "cozinhe", "cozinhar", "asse", "assar", "frite", "fritar", "ferva", "ferver", "misture", "misturar", "mexa", "mexer", "adicione", "adicionar",
    "junte", "juntar", "despeje", "despejar", "sirva", "servir", "leve", "aqueça", "aquecer", "bata", "bater", "refogue", "refogar",
}

_QUANTITY = re.compile(r"^(?:[~≈]?\s*)?(?:\d+(?:[.,/]\d+)?|¼|½|¾|one|two|half|a)\b", re.IGNORECASE)
_UNIT = re.compile(r"\b(?:g|kg|ml|l|oz|lb|tsp|tbsp|cup|cups|pinch|clove|cloves|szklanka|lyżka|gram|gramm|el|tl|tasse|cuillère|cucchiai[oi]?|cucchiaini?|etto|hg|grammi|tazza|tazze|pizzico|spicchi[o]?|colher(?:es)?|xícaras?|xicaras?|chávenas?|chavenas?|colher|pitada|dentes?|quilos?)\b", re.IGNORECASE)


def heading_kind(text: str) -> str | None:
    normalized = re.sub(r"\s+", " ", text).strip().casefold().rstrip(":")
    # "Ingredientes (8 porções)": a trailing parenthetical (servings) is not part of the heading.
    normalized = re.sub(r"\s*\([^)]*\)$", "", normalized).strip().rstrip(":")
    if normalized in INGREDIENT_HEADINGS:
        return "ingredients"
    if normalized in INSTRUCTION_HEADINGS:
        return "instructions"
    if normalized.startswith(INSTRUCTION_HEADING_PREFIXES):
        return "instructions"
    if normalized in NON_RECIPE_HEADINGS or normalized.startswith("nutritional analysis"):
        return "stop"
    return None


_DECORATIVE_EDGE_CHARS = set(":-–—•*#|·▪■□●○◆◇▶►✦✧~_=>")


def _is_decoration(char: str) -> bool:
    """Whitespace, edge punctuation, pictographs, symbols, and emoji joiners/selectors."""

    if char.isspace() or char in _DECORATIVE_EDGE_CHARS:
        return True
    category = unicodedata.category(char)
    # So/Sk: emoji and pictographs; Cf: ZWJ/ZWNJ; Mn/Me: variation selectors and keycap marks.
    return category in {"So", "Sk", "Cf", "Me"} or (category == "Mn" and 0xFE00 <= ord(char) <= 0xFE0F)


def clean_component_name(text: str | None) -> str | None:
    """Clean a heading-derived component name; None for empty or generic section headings.

    Strips emoji/pictographs, decorative symbols, surrounding punctuation and whitespace.
    A heading that is only a generic ingredients/instructions word in a supported
    language yields None (an unnamed component). Specific names get a capitalised
    first letter; the rest of the wording is preserved.
    """

    if not text:
        return None
    start, end = 0, len(text)
    while start < end and _is_decoration(text[start]):
        start += 1
    while end > start and _is_decoration(text[end - 1]):
        end -= 1
    # Markdown emphasis wrapped around the label ("**Frosting:**") is consumed by the edge strip;
    # inner emoji such as "🥕🥕 Sopa" are handled the same way as leading ones.
    name = re.sub(r"\s+", " ", text[start:end]).strip()
    if not name or not any(char.isalnum() for char in name):
        return None
    if heading_kind(name) in {"ingredients", "instructions"}:
        return None
    return name[0].upper() + name[1:]


def instruction_group_variant(text: str) -> str | None:
    normalized = re.sub(r"\s+", " ", text).strip().casefold().rstrip(":").strip()
    if ABBREVIATED_GROUP_LABELS.match(normalized):
        return "abbreviated"
    if FULL_GROUP_LABELS.match(normalized):
        return "full"
    return None


def looks_like_ingredient(text: str) -> bool:
    normalized = text.strip()
    return bool(_QUANTITY.search(normalized) or _UNIT.search(normalized) or re.search(r"\b(?:to taste|as needed|do smaku|nach geschmack|al gusto|q\.\s?b\.|quanto basta|a gusto|a gosto|q\.\s?b|conforme o gosto|quanto baste)\b", normalized, re.I))


def looks_like_step(text: str) -> bool:
    words = set(re.findall(r"[^\W\d_]+", text.casefold()))
    return bool(words & COOKING_VERBS)
