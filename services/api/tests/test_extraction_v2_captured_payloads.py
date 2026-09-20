"""Offline regression cases for every captured extraction-v2 source envelope."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from api.services.extraction_v2.contracts import SOURCE_PAYLOAD_ADAPTER
from api.services.extraction_v2.extractor import RecipeEvidenceExtractor
from api.services.extraction_v2.language import LinguaLanguageDetector
from api.services.extraction_v2.orchestrator import ExtractionDependencies, ExtractionOrchestrator

CAPTURE_DIR = Path(__file__).parent / "captured-payloads"
EXPECTATIONS_PATH = Path(__file__).parent / "fixtures" / "extraction_v2" / "expectations.json"
SKIPPED_CAPTURE_FILES = {"failed-urls.json"}


def _captures() -> list[Path]:
    return sorted(path for path in CAPTURE_DIR.glob("*.json") if path.name not in SKIPPED_CAPTURE_FILES)


def _expectations() -> dict[str, dict[str, Any]]:
    document = json.loads(EXPECTATIONS_PATH.read_text(encoding="utf-8"))
    assert document["version"] == 1
    return document["expectations"]


def _recipe_projection(recipe: dict[str, Any] | None) -> dict[str, Any] | None:
    if recipe is None:
        return None
    return {
        "title": recipe.get("title"),
        "yield_servings": recipe.get("yield_servings"),
        "total_time_minutes": recipe.get("total_time_minutes"),
        "nutrition": recipe.get("nutrition"),
        "components": [
            {
                "name": component.get("name"),
                "ingredients": [
                    {
                        "text": ingredient["text"],
                        "link_url": ingredient.get("link_url"),
                        "links": [
                            {"text": link["text"], "url": link["url"]}
                            for link in ingredient.get("links", [])
                        ],
                    }
                    for ingredient in component.get("ingredients", [])
                ],
                "steps": [step["text"] for step in component.get("steps", [])],
            }
            for component in recipe.get("components", [])
        ],
    }


def _assert_subset(expected: object, actual: object, path: str = "result") -> None:
    if isinstance(expected, dict):
        assert isinstance(actual, dict), f"{path} must be an object"
        for key, value in expected.items():
            assert key in actual, f"{path}.{key} is missing"
            _assert_subset(value, actual[key], f"{path}.{key}")
        return
    assert actual == expected, f"{path}: expected {expected!r}, got {actual!r}"


@pytest.mark.asyncio
@pytest.mark.parametrize("capture_path", _captures(), ids=lambda path: path.stem)
async def test_captured_payload(capture_path: Path) -> None:
    """Every envelope must remain executable; approved fields become exact regressions."""

    payload = json.loads(capture_path.read_text(encoding="utf-8"))
    SOURCE_PAYLOAD_ADAPTER.validate_python(payload)
    outcome = await ExtractionOrchestrator(ExtractionDependencies(
        RecipeEvidenceExtractor(), LinguaLanguageDetector(), transcription_provider=None,
    )).extract(payload)
    actual = outcome.model_dump(mode="json")

    assert actual["outcome"] in {"complete", "incomplete", "failed"}
    expected = _expectations().get(capture_path.name)
    if expected is not None:
        _assert_subset(expected, {
            "outcome": actual["outcome"],
            "issue_codes": actual.get("issue_codes", []),
            "reason": actual.get("reason"),
            "recipe": _recipe_projection(actual.get("recipe")),
        })


def test_every_expectation_references_a_capture() -> None:
    capture_names = {path.name for path in _captures()}
    unknown = sorted(set(_expectations()) - capture_names)
    assert not unknown, f"expectations refer to missing captures: {unknown}"
