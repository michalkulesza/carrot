#!/usr/bin/env python3
"""Build the unlabeled foreign-language unit and amount review CSV."""

import argparse
import csv
import json
import re
import unicodedata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
EXPECTATIONS_PATH = REPO_ROOT / "services/api/tests/fixtures/extraction_v2/expectations.json"
CAPTURES_DIR = REPO_ROOT / "services/api/tests/captured-payloads"
DEFAULT_OUTPUT = REPO_ROOT / "services/api/tests/fixtures/unit_amount_parser_v2/foreign_candidates.csv"

FIELDS = [
    "capture_filename", "source_url", "source_language", "component_index",
    "ingredient_index", "ingredient_text", "category_hints", "sampling_stratum",
    "expected_qty", "expected_unit", "expected_name", "expected_parse_status",
    "reviewer_note", "labeling_status", "draft_qty", "draft_unit", "draft_name",
    "draft_parse_status", "draft_note",
]

# Aliases are grouped by language for documentation and maintenance. Matching is
# accent-insensitive; the original ingredient name is never translated.
# Alias spellings are stored without diacritics. fold() strips accents from
# source text before matching, so this file stays ASCII-safe on Windows too.
ALIASES = {
    "cup": (r"cups?", r"c\.?", r"szklank(?:a|i|e|ami|ach)", r"tassen?", r"tasses?", r"tazas?"),
    "tbsp": (r"tablespoons?", r"tbsp\.?", r"tbs\.?", r"lyzk(?:a|i|e|ek|ami|ach)", r"essloffel", r"el\.?", r"cuilleres?\s+a\s+soupe", r"cuilleres?\s+soupe", r"c\.?\s*a\s*soupe", r"cas?\.?", r"cucharadas?", r"cdas?\.?", r"c\.?\s*sopera"),
    "tsp": (r"teaspoons?", r"tsp\.?", r"ts\.?", r"lyzeczk(?:a|i|e|ek|ami|ach)", r"teeloffel", r"tl\.?", r"cuilleres?\s+a\s+cafe", r"cuilleres?\s+cafe", r"c\.?\s*a\s*cafe", r"cac", r"cc\.?", r"cucharaditas?", r"cdtas?\.?", r"cdt\.?", r"c\.?\s*de\s*cafe"),
    "oz": (r"ounces?", r"oz\.?", r"uncj(?:a|e|i)", r"unzen?", r"onces?", r"onzas?"),
    "lb": (r"pounds?", r"lbs?\.?", r"funt(?:y|ow)?", r"pfund(?:e)?", r"livres?", r"libras?"),
    "g": (r"grams?", r"grs?\.?", r"g\.?", r"gram(?:y|ow)?", r"gramm(?:e)?", r"grammes?", r"gramos?", r"grammi?"),
    "kg": (r"kilograms?", r"kg\.?", r"kilogram(?:y|ow)?", r"kilogramm(?:e)?", r"kilogrammes?", r"kilogramos?"),
    "ml": (r"millilit(?:er|re)s?", r"ml\.?", r"mililitr(?:y|ow)?", r"milliliter", r"millilitres?", r"mililitros?"),
    # unsupported schema unit: cl
    "cl": (r"centilit(?:er|re)s?", r"cl\.?", r"centylitr(?:y|ow)?", r"zentiliter", r"centilitres?", r"centilitros?"),
    "l": (r"lit(?:er|re)s?", r"l\.?", r"litr(?:a|y|ow|ze)?", r"liter", r"litres?", r"litros?"),
    "clove": (r"cloves?", r"zabk(?:i|a|ow|iem)", r"knoblauchzehen?", r"zehen?", r"gousses?", r"dientes?", r"diente\s+de\s+ajo"),
    "leaf": (r"leaves?", r"lisc(?:ie|mi|a)?", r"blatter?", r"feuilles?", r"hojas?"),
    "pinch": (r"pinches?", r"szczypt(?:a|y|e|a)", r"prise", r"pincees?", r"pizcas?"),
    # unsupported schema unit: piece
    "piece": (r"pieces?", r"sztuk(?:a|i|e|a)", r"stucke?", r"morceaux?", r"pieces?", r"trozos?", r"piezas?", r"unidades?"),
    "can": (r"cans?", r"puszk(?:a|i|e|a)", r"dosen?", r"boites?", r"latas?"),
    # unsupported schema unit: package
    "package": (r"packages?", r"pkg\.?", r"opakowani(?:e|a|u)", r"packungen?", r"paquets?", r"paquetes?"),
    "slice": (r"slices?", r"plastr(?:y|ow|a)", r"kromk(?:a|i|e)", r"scheiben?", r"tranches?", r"rodajas?", r"rebanadas?"),
    # unsupported schema unit: stick
    "stick": (r"sticks?", r"lask(?:a|i|e)", r"stangen?", r"batons?"),
    "sprig": (r"sprigs?", r"galazk(?:a|i|e|a)", r"zweige?", r"brins?", r"ramitas?"),
    "sheet": (r"sheets?", r"plat(?:ki|kow)", r"arkusz(?:e|y)?", r"blatter?", r"feuilles?", r"laminas?"),
    # unsupported schema unit: head
    "head": (r"heads?", r"glowk(?:a|i|e)", r"knollen?", r"kopfe?", r"tetes?", r"cabezas?"),
    "bunch": (r"bunch(?:es)?", r"pecz(?:ek|ki|kow)", r"bund(?:e|el)?", r"bottes?", r"manojos?", r"ramilletes?"),
    "handful": (r"handfuls?", r"garsc(?:ie|i|a)", r"handvoll", r"poignees?", r"punados?"),
}

FRACTION_VALUES = {
    "\u00bc": "1/4", "\u00bd": "1/2", "\u00be": "3/4", "\u2153": "1/3",
    "\u2154": "2/3", "\u215b": "1/8", "\u215c": "3/8", "\u215d": "5/8", "\u215e": "7/8",
}
FRACTION_CHARS = "".join(FRACTION_VALUES)
NUMBER = rf"(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+\s*[{FRACTION_CHARS}]|\d+(?:[.,]\d+)?|[{FRACTION_CHARS}])"
RANGE_JOINER = r"(?:-|\u2013|\u2014|\bto\b|\ba\b|\b\u00e0\b|\bbis\b|\bdo\b|\bhasta\b)"
MIXED_JOINER = r"(?:\band\b|\bi\b|\bund\b|\bet\b|\by\b)"
MIXED_VALUE = rf"{NUMBER}(?:\s*{MIXED_JOINER}\s*{NUMBER})?"
AMOUNT = rf"{MIXED_VALUE}(?:\s*(?:{RANGE_JOINER})\s*{MIXED_VALUE})?(?:\s*\+\s*{MIXED_VALUE})?"
AMOUNT_RE = re.compile(rf"^\s*(?P<amount>{AMOUNT})\s*(?P<rest>.*)$", re.I)
LEADING_APPROX_RE = re.compile(r"^\s*(?P<marker>about|approx(?:imately)?\.?|around|circa|ca\.?|approximately|roughly|oko(?:l|\u0142)o|ok\.?|oko|ungef(?:a|\u00e4)hr|etwa|rund|environ|environ\.?|env\.?|approximativement|(?:a|\u00e0)\s+peu\s+(?:pres|pr\u00e8s)|mniej\s+wi(?:e|\u0119)cej|cerca\s+de|aprox(?:imadamente)?\.?|alrededor de|en torno a|aproximadamente)\s*(?P<body>.*)$", re.I)


def fold(value):
    value = value.casefold().replace("\u0142", "l").replace("\u00df", "ss")
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


SUPPORTED_UNITS = {"cup", "tbsp", "tsp", "oz", "lb", "g", "kg", "ml", "l", "clove", "leaf", "pinch", "can", "slice", "sprig", "sheet", "bunch", "handful"}
UNIT_PATTERNS = [
    (re.compile(rf"^(?:{alias})(?=$|[\s,.;:()])", re.I), canonical)
    for canonical, aliases in ALIASES.items() if canonical in SUPPORTED_UNITS
    for alias in aliases
]


def normalize_fraction_glyphs(value):
    def mixed(match):
        return f"{match.group(1)} {FRACTION_VALUES[match.group(2)]}"
    for glyph in FRACTION_VALUES:
        value = re.sub(rf"(\d+)\s*({re.escape(glyph)})", mixed, value)
        value = value.replace(glyph, FRACTION_VALUES[glyph])
    return re.sub(r"\s*/\s*", "/", value)


def normalize_volume_decimals(value):
    from fractions import Fraction
    from decimal import Decimal, InvalidOperation

    def convert(token):
        try:
            fraction = Fraction(Decimal(token))
        except (InvalidOperation, ValueError):
            return token
        if fraction.denominator not in {2, 3, 4, 8, 16}:
            return token
        whole, numerator = divmod(fraction.numerator, fraction.denominator)
        return f"{whole} {numerator}/{fraction.denominator}" if whole and numerator else str(whole) if whole else f"{numerator}/{fraction.denominator}"

    return re.sub(r"\d+(?:\.\d+)?", lambda match: convert(match.group(0)), value)


def draft_for(text):
    original = text.strip()
    approximation = LEADING_APPROX_RE.match(original)
    parse_text = approximation.group("body") if approximation else original
    match = AMOUNT_RE.match(parse_text)
    if not match:
        # Some captured lines put an unambiguous amount and unit after the
        # ingredient name (for example, "brodo 500 ml"). Recover that pair.
        for amount_match in re.finditer(NUMBER, parse_text, re.I):
            rest_after_amount = parse_text[amount_match.end():].lstrip()
            normalized_after = fold(rest_after_amount)
            unit_match = next(((m, unit) for pattern, unit in UNIT_PATTERNS if (m := pattern.match(normalized_after))), None)
            if not unit_match:
                continue
            found, canonical = unit_match
            consumed = 0
            for index in range(1, len(rest_after_amount) + 1):
                if len(fold(rest_after_amount[:index])) >= found.end():
                    consumed = index
                    break
            name = (parse_text[:amount_match.start()] + " " + rest_after_amount[consumed:]).strip(" ,;:-")
            trailing_approx = re.search(r"\s*\((?:circa|ca\.?|approx(?:imately)?|about|oko(?:l|\u0142)o|ungef(?:a|\u00e4)hr|environ|(?:a|\u00e0)\s+peu\s+(?:pres|pr\u00e8s)|mniej\s+wi(?:e|\u0119)cej|cerca\s+de)\)\s*$", name, re.I)
            if trailing_approx:
                name = name[:trailing_approx.start()].rstrip()
            qty = normalize_fraction_glyphs(amount_match.group(0).strip())
            note = "Amount and unit recovered from within the source line; ingredient name kept in source language."
            if approximation:
                note += f" Leading approximation marker '{approximation.group('marker')}' omitted from quantity."
            if trailing_approx:
                note += f" Trailing approximation marker '{trailing_approx.group(0).strip()}' omitted from ingredient name."
            return qty, canonical, name, "parsed", note
        return "", "", original, "uncertain", "No confident amount identified."
    qty = match.group("amount").strip()
    qty = re.sub(rf"\s*{RANGE_JOINER}\s*", "-", qty, flags=re.I)
    qty = re.sub(rf"\s*{MIXED_JOINER}\s*(?={NUMBER})", " ", qty, flags=re.I)
    qty = re.sub(r"(?<=\d),(?=\d)", ".", qty)
    rest = match.group("rest").strip()
    normalized_rest = fold(rest)
    matches = [(found.end(), canonical) for pattern, canonical in UNIT_PATTERNS if (found := pattern.match(normalized_rest))]
    if matches:
        normalized_end, canonical = max(matches, key=lambda item: item[0])
        consumed = 0
        for index in range(1, len(rest) + 1):
            if len(fold(rest[:index])) >= normalized_end:
                consumed = index
                break
        name = rest[consumed:].strip()
        qty = normalize_fraction_glyphs(qty)
        if canonical in {"cup", "tbsp", "tsp"}:
            qty = normalize_volume_decimals(qty)
        note = "Mapped source-language unit to canonical English identifier; ingredient name kept in source language."
        if approximation:
            note += f" Leading approximation marker '{approximation.group('marker')}' omitted from quantity."
        return qty, canonical, name, "parsed", note
    qty = normalize_fraction_glyphs(qty)
    note = "Leading amount identified; no confident supported unit alias found."
    if approximation:
        note += f" Leading approximation marker '{approximation.group('marker')}' omitted from quantity."
    return qty, "", rest, "partial", note

def read_source_url(filename):
    path = CAPTURES_DIR / filename
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("source_url", "") or ""
    except (OSError, json.JSONDecodeError):
        return ""


def collect_rows():
    data = json.loads(EXPECTATIONS_PATH.read_text(encoding="utf-8"))
    rows = []
    for filename, expectation in sorted(data["expectations"].items()):
        language = (expectation.get("detected_languages") or "").strip()
        language_codes = {code.strip().casefold() for code in language.split(",")}
        if not language_codes or language_codes <= {"en"}:
            continue
        recipe = expectation.get("recipe") or {}
        for component_index, component in enumerate(recipe.get("components") or []):
            for ingredient_index, ingredient in enumerate(component.get("ingredients") or []):
                text = ingredient.get("text")
                if not isinstance(text, str) or not text.strip():
                    continue
                rows.append({
                    "capture_filename": filename,
                    "source_url": read_source_url(filename),
                    "source_language": language,
                    "component_index": component_index,
                    "ingredient_index": ingredient_index,
                    "ingredient_text": text,
                    "category_hints": "foreign-language-candidate",
                    "sampling_stratum": "foreign-language",
                    "expected_qty": "", "expected_unit": "", "expected_name": "",
                    "expected_parse_status": "", "reviewer_note": "",
                    "labeling_status": "unreviewed",
                })
    return rows


def preserve_existing_review(rows, output_path):
    if not output_path.is_file():
        return rows
    preserved_fields = (
        "expected_qty", "expected_unit", "expected_name", "expected_parse_status",
        "reviewer_note", "labeling_status", "draft_qty", "draft_unit",
        "draft_name", "draft_parse_status", "draft_note",
    )
    with output_path.open(encoding="utf-8-sig", newline="") as existing_file:
        existing_rows = csv.DictReader(existing_file)
        previous = {
            (row.get("capture_filename", ""), row.get("component_index", ""),
             row.get("ingredient_index", ""), row.get("ingredient_text", "")): row
            for row in existing_rows
        }
    for row in rows:
        key = (row["capture_filename"], str(row["component_index"]),
               str(row["ingredient_index"]), row["ingredient_text"])
        old = previous.get(key)
        if old is not None:
            for field in preserved_fields:
                if field in row:
                    row[field] = old.get(field, "")
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="CSV output path")
    args = parser.parse_args()
    rows = collect_rows()
    for row in rows:
        row.update(dict(zip(("draft_qty", "draft_unit", "draft_name", "draft_parse_status", "draft_note"), draft_for(row["ingredient_text"]))))
    rows = preserve_existing_review(rows, args.output)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8-sig") as output:
        writer = csv.DictWriter(output, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} foreign-language candidates to {args.output}")


if __name__ == "__main__":
    main()
