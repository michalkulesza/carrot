#!/usr/bin/env python3
"""Build a deterministic, unlabeled review set from extraction expectations."""

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
EXPECTATIONS_PATH = REPO_ROOT / "services/api/tests/fixtures/extraction_v2/expectations.json"
CAPTURES_DIR = REPO_ROOT / "services/api/tests/captured-payloads"
DEFAULT_OUTPUT = REPO_ROOT / "services/api/tests/fixtures/unit_amount_parser_v2/candidates.csv"

FRACTION_CHARS = r"\u00bc\u00bd\u00be\u2153\u2154\u215b\u215c\u215d\u215e"
NUMBER = rf"(?:\d+(?:[.,]\d+)?|[{FRACTION_CHARS}]|\d+\s+[{FRACTION_CHARS}])"
QUANTITY_RE = re.compile(rf"(?<!\w){NUMBER}(?!\w)")
RANGE_RE = re.compile(rf"(?<!\w){NUMBER}\s*(?:-|\u2013|\u2014|to)\s*{NUMBER}(?!\w)", re.IGNORECASE)
FRACTION_RE = re.compile(rf"[{FRACTION_CHARS}]|\d+\s*/\s*\d+|\d+\s+[{FRACTION_CHARS}]")
DECIMAL_RE = re.compile(r"(?<!\w)\d+[.,]\d+(?!\w)")
UNIT_RE = re.compile(
    r"\b(?:cups?|c\.?|tbsp\.?|tablespoons?|tsp\.?|teaspoons?|ounces?|oz\.?|"
    r"pounds?|lbs?\.?|grams?|g|kilograms?|kg|millilit(?:er|re)s?|ml|"
    r"lit(?:er|re)s?|l|cloves?|cans?|packages?|pkg\.?|slices?|sticks?)\b",
    re.IGNORECASE,
)
COUNT_SIZE_RE = re.compile(r"\b(?:small|medium|large|cloves?|heads?|bunch(?:es)?|sprigs?|pieces?)\b", re.IGNORECASE)

FIELDS = [
    "capture_filename", "source_url", "component_index", "ingredient_index",
    "ingredient_text", "category_hints", "sampling_stratum", "expected_qty",
    "expected_unit", "expected_name", "expected_parse_status", "reviewer_note",
    "labeling_status", "draft_qty", "draft_unit", "draft_name",
    "draft_parse_status", "draft_note",
]

AMOUNT_PREFIX_RE = re.compile(
    rf"^\s*(?P<amount>{NUMBER}(?:\s*(?:-|\u2013|\u2014|to)\s*{NUMBER})?(?:\s*\+\s*{NUMBER})?)\s*(?P<rest>.*)$",
    re.IGNORECASE,
)
UNIT_PREFIX_RE = re.compile(
    r"^(?P<unit>cups?|c\.?|tbsp\.?|tablespoons?|tsp\.?|teaspoons?|ounces?|oz\.?|"
    r"pounds?|lbs?\.?|grams?|g|kilograms?|kg|millilit(?:er|re)s?|ml|"
    r"lit(?:er|re)s?|l|cloves?|cans?|packages?|pkg\.?|slices?|sticks?|"
    r"sprigs?|leaves?|leaf|sheets?|pieces?|piece|heads?|bunch(?:es)?)\b\s*",
    re.IGNORECASE,
)
UNIT_CANONICAL = {
    "cup": "cup", "c": "cup", "tablespoon": "tbsp", "tbsp": "tbsp",
    "teaspoon": "tsp", "tsp": "tsp", "ounce": "oz", "oz": "oz",
    "pound": "lb", "lb": "lb", "gram": "g", "g": "g", "kilogram": "kg",
    "kg": "kg", "milliliter": "ml", "millilitre": "ml", "ml": "ml",
    "liter": "l", "litre": "l", "l": "l", "clove": "clove", "can": "can",
    "package": "package", "pkg": "package", "slice": "slice", "stick": "stick",
    "sprig": "sprig", "leaf": "leaf", "sheet": "sheet", "piece": "piece",
    "head": "head", "bunch": "bunch",
}


def draft_for(text):
    match = AMOUNT_PREFIX_RE.match(text)
    if not match:
        return "", "", text.strip(), "uncertain", "No confident leading amount identified."
    qty = match.group("amount").strip()
    rest = match.group("rest").strip()
    unit_match = UNIT_PREFIX_RE.match(rest)
    if unit_match:
        source_unit = unit_match.group("unit").rstrip(".").casefold()
        singular = source_unit[:-1] if source_unit.endswith("s") and source_unit not in {"lbs"} else source_unit
        unit = UNIT_CANONICAL.get(singular, UNIT_CANONICAL.get(source_unit, singular))
        return qty, unit, rest[unit_match.end():].strip(), "parsed", "Leading amount and source-spelled unit identified."
    if not rest:
        return qty, "", "", "partial", "Leading amount identified; ingredient name and unit are absent."
    return qty, "", rest, "partial", "Leading amount identified; no confident explicit unit found."


def hints_for(text):
    hints = []
    has_quantity = bool(QUANTITY_RE.search(text))
    if has_quantity:
        hints.append("quantity-looking")
    if FRACTION_RE.search(text):
        hints.append("fraction")
    if RANGE_RE.search(text):
        hints.append("range")
    if DECIMAL_RE.search(text):
        hints.append("decimal")
    elif has_quantity and not FRACTION_RE.search(text) and not RANGE_RE.search(text):
        hints.append("integer")
    if UNIT_RE.search(text):
        hints.append("likely-unit")
    if COUNT_SIZE_RE.search(text):
        hints.append("count-size-descriptor")
    if not has_quantity:
        hints.append("likely-unquantified")
    return hints


def source_url_for(filename):
    path = CAPTURES_DIR / filename
    if not path.is_file():
        return ""
    try:
        envelope = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    return envelope.get("source_url", "") or ""


def candidates():
    data = json.loads(EXPECTATIONS_PATH.read_text(encoding="utf-8"))
    buckets = defaultdict(list)
    seen = set()
    for filename, expectation in sorted(data["expectations"].items()):
        recipe = expectation.get("recipe") or {}
        for component_index, component in enumerate(recipe.get("components") or []):
            for ingredient_index, ingredient in enumerate(component.get("ingredients") or []):
                text = ingredient.get("text")
                if not isinstance(text, str) or not text.strip():
                    continue
                key = re.sub(r"\s+", " ", text).strip().casefold()
                if key in seen:
                    continue
                seen.add(key)
                hints = hints_for(text)
                if "range" in hints:
                    stratum = "range"
                elif "fraction" in hints:
                    stratum = "fraction"
                elif "decimal" in hints:
                    stratum = "decimal"
                elif "integer" in hints:
                    stratum = "integer"
                else:
                    stratum = "likely-unquantified"
                buckets[stratum].append({
                    "capture_filename": filename,
                    "source_url": source_url_for(filename),
                    "component_index": component_index,
                    "ingredient_index": ingredient_index,
                    "ingredient_text": text,
                    "category_hints": ";".join(hints),
                    "sampling_stratum": stratum,
                    "expected_qty": "",
                    "expected_unit": "",
                    "expected_name": "",
                    "reviewer_note": "",
                    "labeling_status": "unreviewed",
                    "expected_parse_status": "",
                    "draft_qty": "",
                    "draft_unit": "",
                    "draft_name": "",
                    "draft_parse_status": "",
                    "draft_note": "",
                })
    return buckets


def select_diverse(limit):
    buckets = candidates()
    strata = ("range", "fraction", "likely-unquantified", "decimal", "integer")
    selected = []
    offsets = {stratum: 0 for stratum in strata}
    while len(selected) < limit:
        added = False
        for stratum in strata:
            offset = offsets[stratum]
            if offset < len(buckets[stratum]) and len(selected) < limit:
                selected.append(buckets[stratum][offset])
                offsets[stratum] += 1
                added = True
        if not added:
            break
    return selected


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
    parser.add_argument("--limit", type=int, default=200, help="maximum candidates (default: 200)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="CSV output path")
    args = parser.parse_args()
    if args.limit < 0:
        parser.error("--limit must be zero or greater")
    rows = select_diverse(args.limit)
    for row in rows:
        row.update(dict(zip(("draft_qty", "draft_unit", "draft_name", "draft_parse_status", "draft_note"), draft_for(row["ingredient_text"]))))
    rows = preserve_existing_review(rows, args.output)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8-sig") as output:
        writer = csv.DictWriter(output, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} candidates to {args.output}")


if __name__ == "__main__":
    main()
