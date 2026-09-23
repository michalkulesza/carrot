#!/usr/bin/env python3
"""Run parser v2 against the approved English and foreign review CSVs."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "services/api/src"))

from api.services.ingredient_parser_v2 import parse_ingredient  # noqa: E402

FIXTURES = ROOT / "services/api/tests/fixtures/unit_amount_parser_v2"
EXPECTATIONS = ROOT / "services/api/tests/fixtures/extraction_v2/expectations.json"
CSV_PATHS = (FIXTURES / "candidates.csv", FIXTURES / "foreign_candidates.csv")
FIELDS = ("qty", "unit", "name")
_FRACTION_GLYPHS = {
    "\u00bc": "1/4", "\u00bd": "1/2", "\u00be": "3/4", "\u2153": "1/3",
    "\u2154": "2/3", "\u215b": "1/8", "\u215c": "3/8", "\u215d": "5/8",
    "\u215e": "7/8",
}


def _language_by_capture() -> dict[str, str]:
    data = json.loads(EXPECTATIONS.read_text(encoding="utf-8"))
    return {
        filename: (item.get("detected_languages") or "en").strip().casefold() or "en"
        for filename, item in data["expectations"].items()
    }


def _clean_expected(value: str | None) -> str | None:
    return value.strip() if value and value.strip() else None


def _normalize_expected_qty(value: str | None) -> str | None:
    value = _clean_expected(value)
    if value is None:
        return None
    for glyph, fraction in _FRACTION_GLYPHS.items():
        value = re.sub(rf"(?<=\d){re.escape(glyph)}", f" {fraction}", value)
        value = value.replace(glyph, fraction)
    return re.sub(r"\s+", " ", value).strip()


def _load_rows(languages: dict[str, str]) -> list[dict]:
    rows = []
    for path in CSV_PATHS:
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for raw in csv.DictReader(handle):
                status = raw.get("labeling_status", "").strip().casefold()
                if status != "reviewed":
                    continue
                language = raw.get("source_language", "").strip().casefold() or languages.get(raw.get("capture_filename", ""), "en")
                parsed = parse_ingredient(raw["ingredient_text"])
                expected = {
                    "qty": _normalize_expected_qty(raw.get("expected_qty")),
                    "unit": _clean_expected(raw.get("expected_unit")),
                    "name": _clean_expected(raw.get("expected_name")),
                }
                result = {"source": str(path.name), "language": language, "text": raw["ingredient_text"], "category_hints": raw.get("category_hints", ""), "expected": expected, "actual": {key: getattr(parsed, key) for key in FIELDS}}
                result["matches"] = {key: result["expected"][key] == result["actual"][key] for key in FIELDS}
                result["row_ref"] = f"{raw.get('capture_filename')}:{raw.get('component_index')}:{raw.get('ingredient_index')}"
                rows.append(result)
    return rows


def _summary(rows: list[dict]) -> dict:
    groups: dict[str, list[dict]] = defaultdict(list)
    # The candidate sample intentionally overlaps the comprehensive foreign set.
    # Keep per-file results, but count a capture ingredient only once overall.
    unique = {}
    for row in rows:
        unique.setdefault(row["row_ref"] + "\0" + row["text"], row)
    groups["overall"] = list(unique.values())
    for row in rows:
        groups[f"source:{row['source']}"] .append(row)
    for row in unique.values():
        groups[f"language:{row['language']}"] .append(row)
        categories = [c for c in row["category_hints"].split(";") if c]
        for category in categories or ["uncategorized"]:
            groups[f"category:{category}"].append(row)
    result = {}
    for name, group in sorted(groups.items()):
        field_counts = {field: sum(row["matches"][field] for row in group) for field in FIELDS}
        result[name] = {
            "rows": len(group),
            "fields": {field: {"correct": count, "total": len(group), "rate": count / len(group) if group else None} for field, count in field_counts.items()},
            "all_fields_correct": sum(all(row["matches"].values()) for row in group),
            "all_fields_rate": sum(all(row["matches"].values()) for row in group) / len(group) if group else None,
        }
    return result


def main() -> None:
    # Fixture strings contain Polish, French, and fraction glyphs. On Windows,
    # the active console may use cp1252; escape unrepresentable output instead
    # of letting mismatch printing abort the benchmark.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="ascii", errors="backslashreplace")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-out", type=Path, help="Write full summary and row mismatches to this JSON file")
    parser.add_argument("--mismatches", action="store_true", help="Print every mismatched row")
    args = parser.parse_args()
    rows = _load_rows(_language_by_capture())
    unique_rows = {}
    for row in rows:
        unique_rows.setdefault(row["row_ref"] + "\0" + row["text"], row)
    report = {"reviewed_rows_including_overlap": len(rows), "reviewed_rows_deduplicated": len(unique_rows), "summary": _summary(rows), "mismatches": [row for row in unique_rows.values() if not all(row["matches"].values())]}
    for name, stats in report["summary"].items():
        fields = " ".join(f"{key}={value['correct']}/{value['total']} ({value['rate']:.1%})" for key, value in stats["fields"].items())
        print(f"{name}: n={stats['rows']} all={stats['all_fields_correct']}/{stats['rows']} ({stats['all_fields_rate']:.1%}) {fields}")
    if args.mismatches:
        print("\nMismatches:")
        for row in report["mismatches"]:
            print(json.dumps(row, ensure_ascii=False))
    if args.json_out:
        args.json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote report to {args.json_out}")


if __name__ == "__main__":
    main()
