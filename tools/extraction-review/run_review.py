"""Offline, auditable replay for extractor-v2 fixture cases."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from openpyxl import Workbook, load_workbook

from api.services.extraction_v2.contracts import ExtractionInput
from api.services.extraction_v2.extractor import RecipeEvidenceExtractor


def literal_cell(value: object) -> str:
    text = str(value)
    return f"'{text}" if text.startswith(("=", "+", "-", "@")) else text


def load_notes(path: Path | None) -> dict[str, str]:
    if path is None or not path.exists():
        return {}
    sheet = load_workbook(path, read_only=True, data_only=False).active
    headers = {str(cell.value): index for index, cell in enumerate(next(sheet.iter_rows(values_only=True)), start=1)}
    if "case_id" not in headers or "reviewer_notes" not in headers:
        return {}
    return {str(row[headers["case_id"] - 1]): str(row[headers["reviewer_notes"] - 1] or "") for row in sheet.iter_rows(min_row=2, values_only=True)}


async def replay_case(root: Path, case: dict[str, Any]) -> dict[str, Any]:
    case_id = case["id"]
    input_path = root / case["input_path"]
    content = input_path.read_text(encoding="utf-8")
    actual_hash = hashlib.sha256(content.encode()).hexdigest()
    if actual_hash != case["sha256"]:
        return {"case_id": case_id, "status": "failed", "reason": "INPUT_HASH_MISMATCH", "actual_hash": actual_hash}
    source = ExtractionInput(content=content, evidence_ids=case.get("evidence_ids", ["fixture:0"]), spans=case.get("spans", []))
    extractor = RecipeEvidenceExtractor()
    recipe = await (extractor.extract_html(source) if case["kind"] == "html" else extractor.extract_text(source))
    return {
        "case_id": case_id,
        "status": "ok",
        "input_hash": actual_hash,
        "input_path": case["input_path"],
        "kind": case["kind"],
        "v2": recipe.model_dump(mode="json"),
        "legacy": case.get("legacy_result"),
        "frozen_requests": case.get("model_requests", []),
        "frozen_responses": case.get("model_responses", []),
        "captured_at": datetime.now(UTC).isoformat(),
    }


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--resume-from", type=Path)
    parser.add_argument("--allow-paid-models", action="store_true")
    args = parser.parse_args()
    if args.allow_paid_models:
        raise SystemExit("This offline runner has no paid-model adapter configured")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if manifest.get("version") != 1:
        raise SystemExit("unsupported manifest version")
    args.output.mkdir(parents=True, exist_ok=True)
    notes = load_notes(args.resume_from)
    rows = []
    for case in manifest.get("cases", []):
        result = await replay_case(args.manifest.parent, case)
        artifact = args.output / f"{result['case_id']}.json"
        artifact.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        rows.append((result, notes.get(result["case_id"], ""), artifact.name))
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Extraction review"
    sheet.append(["case_id", "status", "input_hash", "artifact", "legacy_recorded", "reviewer_notes"])
    for result, note, artifact in rows:
        sheet.append([literal_cell(result["case_id"]), result["status"], result.get("input_hash", ""), artifact,
                      bool(result.get("legacy") is not None), literal_cell(note)])
    workbook.save(args.output / "review.xlsx")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
