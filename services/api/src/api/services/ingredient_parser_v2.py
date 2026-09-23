"""Deterministic ingredient amount/unit parser for extracted recipe lines.

This module parses already-extracted ingredient text without external calls.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from fractions import Fraction


@dataclass(frozen=True)
class IngredientParse:
    source_text: str
    qty: str | None
    unit: str | None
    name: str | None
    status: str

    def as_dict(self) -> dict[str, str | None]:
        return asdict(self)


_GLYPHS = {"\u00bc": "1/4", "\u00bd": "1/2", "\u00be": "3/4", "\u2153": "1/3", "\u2154": "2/3", "\u215b": "1/8", "\u215c": "3/8", "\u215d": "5/8", "\u215e": "7/8"}
_GLYPH_CHARS = "".join(_GLYPHS)
_NUM = rf"(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+\s*[{_GLYPH_CHARS}]|\d+(?:[.,]\d+)?|[{_GLYPH_CHARS}])"
_RANGE = r"(?:-|\u2013|\u2014|\bto\b|\ba\b|\b\u00e0\b|\bbis\b|\bdo\b|\bhasta\b)"
_MIXED = r"(?:\band\b|\bi\b|\bund\b|\bet\b|\by\b|\boraz\b|\+ )"
_AMOUNT = re.compile(rf"^\s*(?P<amount>{_NUM}(?:\s*{_RANGE}\s*{_NUM})?(?:\s*(?:\+|{_MIXED})\s*{_NUM})?)\s*(?P<rest>.*)$", re.I)
_APPROX = re.compile(r"^\s*(?:about|approx(?:imately)?\.?|around|circa|ca\.?|roughly|oko(?:\u0142|l)o|ok\.?|ungef(?:a|\u00e4)hr|etwa|rund|environ(?:ne)?|env\.?|\u00e0 peu pr\u00e8s|a peu pres|mniej wi(?:e|\u0119)cej|mniej wiecej|cerca de|aprox(?:imadamente)?\.?|alrededor de|en torno a)\s+", re.I)


def _fold(value: str) -> str:
    value = value.casefold().replace("\u0142", "l").replace("\u00df", "ss")
    return "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c))


# Supported canonical application IDs. Regexes are applied to accent-folded
# source text, but name and source_text are returned with their original spelling.
_ALIASES: dict[str, tuple[str, ...]] = {
    "cup": (r"cups?", r"c\.?", r"szklank(?:a|i|e|ami|ach)", r"tassen?", r"tasses?", r"tazas?", r"verres?"),
    "tbsp": (r"tablespoons?", r"tbsp\.?", r"tbs\.?", r"lyzk(?:a|i|e|ek|ami|ach)", r"essloffel", r"el\.?", r"cuilleres?\s+(?:a\s+)?soupe", r"c\.?\s*a\s*soupe", r"cas?\.?", r"cucharadas?", r"cdas?\.?", r"c\.?\s*sopera"),
    "tsp": (r"teaspoons?", r"tsp\.?", r"ts\.?", r"lyzeczk(?:a|i|e|ek|ami|ach)", r"teeloffel", r"tl\.?", r"cuilleres?\s+(?:a\s+)?cafe", r"c\.?\s*a\s*cafe", r"cac", r"cc\.?", r"cucharaditas?", r"cditas?\.?", r"cdtas?\.?", r"cdt\.?", r"c\.?\s*de\s*cafe"),
    "oz": (r"ounces?", r"oz\.?", r"uncj(?:a|e|i)", r"unzen?", r"onces?", r"onzas?"),
    "lb": (r"pounds?", r"lbs?\.?", r"funt(?:y|ow)?", r"pfund(?:e)?", r"livres?", r"libras?"),
    "g": (r"grams?", r"grs?\.?", r"g\.?", r"gram(?:y|ow)?", r"gramm(?:e)?", r"grammes?", r"gramos?", r"grammi?"),
    "kg": (r"kilograms?", r"kg\.?", r"kilogram(?:y|ow)?", r"kilogramm(?:e)?", r"kilogrammes?", r"kilogramos?"),
    "ml": (r"millilit(?:er|re)s?", r"ml\.?", r"mililitr(?:y|ow)?", r"millilitres?", r"mililitros?"),
    "cl": (r"centilit(?:er|re)s?", r"cl\.?", r"centylitr(?:y|ow)?", r"zentiliter", r"centilitres?", r"centilitros?"),
    "l": (r"lit(?:er|re)s?", r"l\.?", r"litr(?:a|y|ow|ze)?", r"litres?", r"litros?"),
    "clove": (r"cloves?", r"zabk(?:i|a|ow|iem)", r"knoblauchzehen?", r"zehen?", r"gousses?", r"dientes?", r"diente\s+de\s+ajo"),
    "leaf": (r"leaves?", r"lisc(?:ie|mi|a)?", r"blatter?", r"feuilles?", r"hojas?"),
    "pinch": (r"pinches?", r"szczypt(?:a|y|e)", r"prises?", r"pincees?", r"pizcas?"),
    "can": (r"cans?", r"puszk(?:a|i|e)", r"dosen?", r"boites?", r"latas?"),
    "slice": (r"slices?", r"plastr(?:y|ow|a)", r"kromk(?:a|i|e)", r"scheiben?", r"tranches?", r"rodajas?", r"rebanadas?"),
    "sprig": (r"sprigs?", r"galazk(?:a|i|e)", r"zweige?", r"brins?", r"ramitas?"),
    "sheet": (r"sheets?", r"plat(?:ki|kow)", r"arkusz(?:e|y)?", r"blatter?", r"feuilles?", r"laminas?"),
    "bunch": (r"bunch(?:es)?", r"pecz(?:ek|ki|kow)", r"bund(?:e|el)?", r"bottes?", r"manojos?", r"ramilletes?"),
    "handful": (r"handfuls?", r"garsc(?:ie|i|a)", r"handvoll", r"poignees?", r"punados?"),
    "piece": (r"pieces?", r"sztuk(?:a|i|e)", r"stucke?", r"morceaux?", r"trozos?", r"piezas?", r"unidades?"),
}
_UNIT_PATTERNS = [(re.compile(rf"^(?:{alias})(?=$|[\s,.;:()])", re.I), unit) for unit, aliases in _ALIASES.items() for alias in aliases]
_EN_TBSP = re.compile(rf"^(?P<a>\d+(?:[.,]\d+)?|\d+\s*/\s*\d+|[{_GLYPH_CHARS}])\s*(?:tablespoons?|tbsp\.?)\s*(?:\+|plus|and)\s*(?P<b>\d+(?:[.,]\d+)?|\d+\s*/\s*\d+|[{_GLYPH_CHARS}])\s*(?:teaspoons?|tsp\.?)\b\s*(?P<name>.*)$", re.I)
_DESCRIPTORS = re.compile(r"^(?:large|medium|small|extra-large|xl|jumbo|whole|ripe|fresh|raw|boneless|skinless|packed|heaped|level)\b", re.I)
_UNSUPPORTED_UNITS = re.compile(r"^(?P<unit>bags?|pieces?|sticks?|heads?|packages?|pkg\.?|jars?|bottles?)\b", re.I)
_ALTERNATIVE = re.compile(r"\b(?:or|ou|oder|o|rather than)\b", re.I)
_CONDITIONAL_ALTERNATIVE = re.compile(r"\([^)]*\b(?:if|unless)\b[^)]*\)", re.I)


def _fold_glyphs(value: str) -> str:
    for glyph, fraction in _GLYPHS.items():
        value = re.sub(rf"(?<=\d){re.escape(glyph)}", f" {fraction}", value)
        value = value.replace(glyph, fraction)
    value = re.sub(r"\s*/\s*", "/", value)
    return re.sub(r"(?<=\d)\s+(?=\d+\s*/)", " ", value)


def _unit_prefix(value: str) -> tuple[re.Match[str], str] | None:
    matches = [(match, unit) for pattern, unit in _UNIT_PATTERNS if (match := pattern.match(value))]
    return max(matches, key=lambda item: item[0].end(), default=None)


def _trailing_unit(rest: str) -> tuple[int, re.Match[str], str] | None:
    """Find a clear unit following its ingredient noun, such as garlic cloves."""
    boundary = re.search(r"[,;()]", rest)
    head_end = boundary.start() if boundary else len(rest)
    head = rest[:head_end]
    for start in (match.start() for match in re.finditer(r"\S+", head)):
        found = _unit_prefix(_fold(head[start:]))
        if found is None:
            continue
        unit_match, canonical = found
        consumed = next((i for i in range(1, len(head) - start + 1) if len(_fold(head[start:start + i])) >= unit_match.end()), 0)
        if start > 0 and head[:start].strip() and not head[start + consumed:].strip():
            return start, unit_match, canonical
    return None


def _supported_pair_count(value: str) -> int:
    return sum(1 for number in re.finditer(_NUM, value, re.I) if _unit_prefix(_fold(value[number.end():].lstrip())))


def _has_multiple_comma_separated_pairs(value: str) -> bool:
    spans = []
    for number in re.finditer(_NUM, value, re.I):
        tail = value[number.end():]
        leading_ws = len(tail) - len(tail.lstrip())
        unit = _unit_prefix(_fold(tail.lstrip()))
        if unit is None:
            continue
        found, _ = unit
        unit_end = next((i for i in range(1, len(tail) - leading_ws + 1) if len(_fold(tail[leading_ws:leading_ws + i])) >= found.end()), 0)
        spans.append((number.start(), number.end() + leading_ws + unit_end))
    return any("," in value[left_end:right_start] for (_, left_end), (right_start, _) in zip(spans, spans[1:]))

def _decimal_point(value: str) -> str:
    # A comma between digits is a decimal separator in these source recipes.
    return re.sub(r"(?<=\d),(?=\d)", ".", value)


def _fraction_if_exact(value: str) -> str:
    """Format exact common US-volume fractions without rounding."""
    common = {2, 3, 4, 8, 16}

    def convert(token: str) -> str:
        try:
            fraction = Fraction(Decimal(token))
        except (InvalidOperation, ValueError):
            return token
        if fraction.denominator not in common:
            return token
        whole, numerator = divmod(fraction.numerator, fraction.denominator)
        if numerator == 0:
            return str(whole)
        return f"{whole} {numerator}/{fraction.denominator}" if whole else f"{numerator}/{fraction.denominator}"

    return re.sub(r"\d+\.\d+", lambda m: convert(m.group()), value)


def _normalize_qty(value: str, unit: str | None) -> str:
    value = _fold_glyphs(value.strip())
    value = re.sub(rf"\s*{_RANGE}\s*", "-", value, flags=re.I)
    value = re.sub(rf"\s*(?:\band\b|\bi\b|\bund\b|\bet\b|\by\b|\boraz\b)\s*(?=\d|[{_GLYPH_CHARS}])", " ", value, flags=re.I)
    value = _decimal_point(value)
    if unit in {"cup", "tbsp", "tsp"}:
        # Fractions in mixed/range expressions are retained; only decimal tokens convert.
        value = re.sub(r"\d+\.\d+", lambda m: _fraction_if_exact(m.group()), value)
    return re.sub(r"\s+", " ", value).strip()


def parse_ingredient(source_text: str) -> IngredientParse:
    """Parse one extracted source line without external calls or inference."""
    original = source_text.strip()
    if not original:
        return IngredientParse(source_text, None, None, "", "uncertain")

    # Some captured ingredient rows include a ratio after an arrow. Parse the
    # ingredient on the left while retaining the untouched source_text.
    parse_text = original.split("\u2192", 1)[0].rstrip()
    parse_text = _APPROX.sub("", parse_text, count=1)
    additive = _EN_TBSP.match(parse_text)
    if additive:
        try:
            def fraction_value(value: str) -> Fraction:
                for glyph, fraction in _GLYPHS.items():
                    value = value.replace(glyph, fraction)
                return Fraction(value.replace(",", "."))

            quantity = fraction_value(additive.group("a")) + fraction_value(additive.group("b")) / 3
            whole, remainder = divmod(quantity.numerator, quantity.denominator)
            qty = str(whole) if not remainder else f"{whole} {remainder}/{quantity.denominator}" if whole else f"{remainder}/{quantity.denominator}"
            return IngredientParse(source_text, qty, "tbsp", additive.group("name").strip(), "parsed")
        except (ValueError, ZeroDivisionError):
            pass
    explicit_pairs = _supported_pair_count(parse_text)
    has_explicit_alternative = bool(_ALTERNATIVE.search(parse_text)) and explicit_pairs > 1
    has_conditional_alternative = False
    for conditional in _CONDITIONAL_ALTERNATIVE.finditer(parse_text):
        inside_pairs = _supported_pair_count(conditional.group())
        if inside_pairs and explicit_pairs > inside_pairs:
            has_conditional_alternative = True
            break
    if has_explicit_alternative:
        return IngredientParse(source_text, None, None, original, "uncertain")
    has_multiple_items = _has_multiple_comma_separated_pairs(parse_text)
    match = _AMOUNT.match(parse_text)
    if not match:
        if has_conditional_alternative:
            return IngredientParse(source_text, None, None, original, "uncertain")
        # A few sources embed a clear amount/unit pair after an ingredient label
        # or name (for example, "Carne: 2.4 kg ..." or "brodo 500 ml").
        for amount_match in re.finditer(_NUM, parse_text, re.I):
            tail = parse_text[amount_match.end():]
            folded_tail = _fold(tail.lstrip())
            alias_match = _unit_prefix(folded_tail)
            if alias_match is None:
                continue
            unit_found, unit = alias_match
            leading_ws = len(tail) - len(tail.lstrip())
            unit_end = next((i for i in range(1, len(tail) - leading_ws + 1) if len(_fold(tail[leading_ws:leading_ws + i])) >= unit_found.end()), 0)
            start, end = amount_match.start(), amount_match.end() + leading_ws + unit_end
            name = re.sub(r"\s+", " ", (parse_text[:start] + " " + parse_text[end:]).strip(" ,;:-"))
            name = re.sub(r"\s*\((?:circa|ca\.?|approx(?:imately)?|about|oko(?:\u0142|l)o|ungef(?:a|\u00e4)hr|environ)\)\s*$", "", name, flags=re.I).rstrip()
            status = "uncertain" if has_multiple_items else "parsed"
            return IngredientParse(source_text, _normalize_qty(amount_match.group(), unit), unit, name or None, status)
        return IngredientParse(source_text, None, None, original, "uncertain")

    qty = match.group("amount").strip()
    rest = match.group("rest").strip()
    folded = _fold(rest)
    # Allow a small parenthetical size descriptor before an explicit count unit.
    size_prefix = re.match(r"^(?P<prefix>\([^)]*\)\s*)(?P<tail>.*)$", rest)
    unit_source = size_prefix.group("tail") if size_prefix else rest
    unit_match = _unit_prefix(_fold(unit_source))
    if unit_match:
        found, unit = unit_match
        consumed = next((i for i in range(1, len(unit_source) + 1) if len(_fold(unit_source[:i])) >= found.end()), 0)
        name = re.sub(r"\s+", " ", ((size_prefix.group("prefix") if size_prefix else "") + unit_source[consumed:]).strip())
        source_unit = _fold(unit_source[:consumed].strip())
        if source_unit.startswith("verre") and re.match(r"^de\s+", name, re.I):
            name = re.sub(r"^de\s+", "", name, count=1, flags=re.I)
        status = "uncertain" if has_conditional_alternative or has_multiple_items else "parsed"
        return IngredientParse(source_text, _normalize_qty(qty, unit), unit, name or None, status)

    unsupported = _UNSUPPORTED_UNITS.match(unit_source)
    if unsupported:
        unit = unsupported.group("unit").casefold().rstrip("s")
        name = re.sub(r"\s+", " ", unit_source[unsupported.end():].strip())
        return IngredientParse(source_text, _normalize_qty(qty, unit), unit, name or None, "partial")

    trailing_unit = _trailing_unit(rest)
    if trailing_unit:
        start, found, unit = trailing_unit
        consumed = next((i for i in range(1, len(rest) - start + 1) if len(_fold(rest[start:start + i])) >= found.end()), 0)
        name = (rest[:start].rstrip() + rest[start + consumed:]).strip()
        name = re.sub(r"\s+,", ",", name)
        return IngredientParse(source_text, _normalize_qty(qty, unit), unit, name or None, "parsed")

    # Explicit but currently unsupported package/count units stay visible and
    # partial rather than being silently dropped or promoted to the DB enum.
    unsupported = _UNSUPPORTED_UNITS.match(rest)
    if unsupported:
        unit = unsupported.group("unit").casefold().rstrip("s")
        return IngredientParse(source_text, _normalize_qty(qty, unit), unit, rest[unsupported.end():].strip(), "partial")

    # Avoid treating ordinary count/size descriptors as unsupported units.
    if _DESCRIPTORS.match(rest):
        return IngredientParse(source_text, _normalize_qty(qty, None), None, rest, "parsed")
    if not rest:
        return IngredientParse(source_text, _normalize_qty(qty, None), None, "", "partial")
    return IngredientParse(source_text, _normalize_qty(qty, None), None, rest, "parsed")
