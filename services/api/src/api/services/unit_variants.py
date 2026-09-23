"""Deterministic, conservative conversion of recipe display variants."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from api.services.ingredient_parser_v2 import parse_ingredient


_COUNT_UNITS = {
    "clove", "leaf", "pinch", "can", "slice", "sprig", "sheet", "bunch",
    "handful", "piece", "bag", "stick", "head", "package", "pkg", "jar", "bottle",
}
_SINGLE_NUMBER = re.compile(r"^\s*(\d+(?:[.,]\d+)?|\d+\s*/\s*\d+|\d+\s+\d+\s*/\s*\d+)\s*$")
_SOURCE_MEASURE = re.compile(
    r"^(?P<prefix>\s*(?:(?:about|approx(?:imately)?|around|roughly|ca\.?)\s+)?)"
    r"(?P<amount>\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+(?:[.,]\d+)?)"
    r"(?P<space>\s+)(?P<unit>fl\s?oz|fluid\s+ounces?|ounces?|oz|pounds?|lbs?|lb|funt(?:y|ow)?|pfund(?:e)?|livres?|libras?|"
    r"kilograms?|kg|kilogram(?:y|ow)?|kilogramm(?:e)?|kilogrammes?|kilogramos?|grams?|g|gram(?:y|ow)?|gramm(?:e)?|grammes?|gramos?|"
    r"millilit(?:er|re)s?|ml|mililitr(?:y|ow)?|mililitros?|centilit(?:er|re)s?|cl|centylitr(?:y|ow)?|zentiliter|centilitros?|"
    r"lit(?:er|re)s?|l|litr(?:a|y|ow|ze)?|litros?|quarts?|qt|inch(?:es)?|centimeters?|centimetres?|cm)\b",
    re.I,
)


def _number(value: str) -> Decimal | None:
    match = _SINGLE_NUMBER.match(value)
    if not match:
        return None
    token = match.group(1).replace(",", ".")
    try:
        if "/" in token:
            parts = token.split()
            fraction = parts[-1].split("/")
            result = Decimal(fraction[0]) / Decimal(fraction[1])
            return result + Decimal(parts[0]) if len(parts) == 2 else result
        return Decimal(token)
    except (InvalidOperation, ZeroDivisionError):
        return None


def _display(value: Decimal) -> str:
    rounded = value.quantize(Decimal("0.01" if abs(value) < 1 else "0.1"))
    return str(rounded.quantize(Decimal("1"))) if rounded == rounded.to_integral() else format(rounded.normalize(), "f")


def convert_ingredient(source: str, target: str) -> str:
    """Convert an unambiguous parsed quantity; retain source for all other cases."""
    parsed = parse_ingredient(source)
    if parsed.status != "parsed" or not parsed.qty or not parsed.unit or parsed.unit in _COUNT_UNITS:
        return source
    # A cup in the line fixes both variants to the original wording. No density
    # or volume assumption is made for cup measures.
    if parsed.unit == "cup" or re.search(r"\bcups?\b", source, re.I):
        return source
    amount = _number(parsed.qty)
    if amount is None:
        return source

    unit = parsed.unit
    measure_match = _SOURCE_MEASURE.match(source)
    if measure_match is None:
        return source
    # The parsed unit and original span must agree; this guards against changing
    # a number elsewhere in a line with an unusual or ambiguous layout.
    source_amount = _number(measure_match.group("amount"))
    if source_amount != amount:
        return source
    source_unit = measure_match.group("unit").casefold().replace(" ", "")
    aliases = {
        "ounce": "oz", "ounces": "oz", "oz": "oz", "pound": "lb", "pounds": "lb", "lb": "lb", "lbs": "lb", "funt": "lb", "funty": "lb", "funtow": "lb", "pfund": "lb", "pfunde": "lb", "livre": "lb", "livres": "lb", "libra": "lb", "libras": "lb",
        "gram": "g", "grams": "g", "gramy": "g", "gramow": "g", "gramm": "g", "gramme": "g", "grammes": "g", "gramos": "g", "g": "g", "kilogram": "kg", "kilograms": "kg", "kilogramy": "kg", "kilogramow": "kg", "kilogramm": "kg", "kilogramme": "kg", "kilogrammes": "kg", "kilogramos": "kg", "kg": "kg",
        "milliliter": "ml", "milliliters": "ml", "millilitre": "ml", "millilitres": "ml", "mililitr": "ml", "mililitrow": "ml", "mililitros": "ml", "ml": "ml",
        "centiliter": "cl", "centiliters": "cl", "centilitre": "cl", "centilitres": "cl", "centilitros": "cl", "cl": "cl",
        "liter": "l", "liters": "l", "litre": "l", "litres": "l", "litros": "l", "l": "l",
        "floz": "floz", "fluidounces": "floz", "quart": "qt", "quarts": "qt", "qt": "qt",
        "inch": "in", "inches": "in", "centimeter": "cm", "centimeters": "cm", "centimetre": "cm", "centimetres": "cm", "cm": "cm",
    }
    unit = aliases.get(source_unit, unit)
    if target == "metric":
        if unit in {"g", "kg", "ml", "cl", "l"}:
            return source
        factors = {"oz": (Decimal("28.3495"), "g"), "lb": (Decimal("453.592"), "g"), "floz": (Decimal("29.5735"), "ml"), "qt": (Decimal("946.353"), "ml"), "in": (Decimal("2.54"), "cm")}
        if unit not in factors:
            return source
        factor, out_unit = factors[unit]
        converted = amount * factor
        if _display(converted) == "0":
            return source
        if unit in {"oz", "lb"} and converted >= 1000:
            converted, out_unit = converted / 1000, "kg"
        return _replace_measure(source, measure_match, converted, out_unit)

    if unit in {"oz", "lb"}:
        return source
    factors = {"g": (Decimal("0.035274"), "oz"), "kg": (Decimal("2.20462"), "lb"), "ml": (Decimal("0.033814"), "fl oz"), "cl": (Decimal("0.33814"), "fl oz"), "l": (Decimal("1.05669"), "qt"), "cm": (Decimal("0.393701"), "inch")}
    if unit not in factors:
        return source
    factor, out_unit = factors[unit]
    converted = amount * factor
    if _display(converted) == "0":
        return source
    if unit == "g" and converted >= 16:
        converted, out_unit = converted / 16, "lb"
    if unit == "ml" and converted >= 32:
        converted, out_unit = converted / 32, "qt"
    return _replace_measure(source, measure_match, converted, out_unit)


def _replace_measure(source: str, match: re.Match[str], amount: Decimal, unit: str) -> str:
    replacement = f"{match.group('prefix')}{_display(amount)} {unit}"
    suffix_start = match.end()
    source_unit = match.group("unit").casefold()
    if source_unit in {"lb", "lbs", "oz", "qt", "g", "kg", "ml", "cl", "l", "cm"}:
        if source[suffix_start:suffix_start + 1] == "." and source[suffix_start + 1:suffix_start + 2].isspace():
            suffix_start += 1
    return source[:match.start()] + replacement + source[suffix_start:]


_TEMP = re.compile(r"(?P<value>-?\d+(?:[.,]\d+)?)\s*(?P<marker>°\s*|degrees?\s+)?(?P<unit>[CF])\b", re.I)


def convert_step(source: str, target: str) -> str:
    def replace(match: re.Match[str]) -> str:
        unit = match.group("unit").upper()
        value = Decimal(match.group("value").replace(",", "."))
        if match.group("marker") is None and not (unit == "C" and value >= 30):
            return match.group(0)
        if target == "metric" and unit == "F":
            return f"{_display((value - 32) * 5 / 9)}°C"
        if target == "imperial" and unit == "C":
            return f"{_display(value * 9 / 5 + 32)}°F"
        return match.group(0)
    return _TEMP.sub(replace, source)


def build_variants(ingredients: list[str], steps: list[str]) -> dict[str, list[str]]:
    return {
        "metric_ingredients": [convert_ingredient(value, "metric") for value in ingredients],
        "imperial_ingredients": [convert_ingredient(value, "imperial") for value in ingredients],
        "metric_steps": [convert_step(value, "metric") for value in steps],
        "imperial_steps": [convert_step(value, "imperial") for value in steps],
    }
