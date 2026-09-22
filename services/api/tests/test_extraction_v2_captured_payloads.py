"""Regression cases for every captured extraction-v2 source envelope."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from api.services.extraction_v2.contracts import SOURCE_PAYLOAD_ADAPTER, TextSelection
from api.services.extraction_v2.adapters import GeminiAudioEvidenceExtractor
from api.services.extraction_v2.extractor import RecipeEvidenceExtractor
from api.services.extraction_v2.gemini_selection import HybridTextExtractor
from api.services.extraction_v2.language import LinguaLanguageDetector
from api.services.extraction_v2.orchestrator import ExtractionDependencies, ExtractionOrchestrator

CAPTURE_DIR = Path(__file__).parent / "captured-payloads"
EXPECTATIONS_PATH = Path(__file__).parent / "fixtures" / "extraction_v2" / "expectations.json"
SKIPPED_CAPTURE_FILES = {"failed-urls.json"}


class _ReviewedSelection:
    def __init__(self, selection: dict[str, Any]) -> None:
        self._selection = TextSelection.model_validate(selection)

    async def select(self, source: object) -> TextSelection:
        return self._selection


def _captures() -> list[Path]:
    return sorted(path for path in CAPTURE_DIR.glob("*.json") if path.name not in SKIPPED_CAPTURE_FILES)


def _expectations() -> dict[str, dict[str, Any]]:
    document = json.loads(EXPECTATIONS_PATH.read_text(encoding="utf-8"))
    assert document["version"] == 1
    return document["expectations"]


def _reviewed_captures() -> list[Path]:
    expectations = _expectations()
    return [path for path in _captures() if path.name in expectations]


def _recipe_projection(recipe: dict[str, Any] | None) -> dict[str, Any] | None:
    if recipe is None:
        return None
    return {
        "title": recipe.get("title"),
        "yield": recipe.get("yield_servings"),
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
    if isinstance(expected, list):
        assert isinstance(actual, list), f"{path} must be an array"
        assert len(actual) == len(expected), f"{path}: expected {len(expected)} items, got {len(actual)}"
        for index, value in enumerate(expected):
            _assert_subset(value, actual[index], f"{path}[{index}]")
        return
    if isinstance(expected, str) and isinstance(actual, str):
        assert actual.strip() == expected.strip(), f"{path}: expected {expected!r}, got {actual!r}"
        return
    assert actual == expected, f"{path}: expected {expected!r}, got {actual!r}"


@pytest.mark.asyncio
@pytest.mark.parametrize("capture_path", _reviewed_captures(), ids=lambda path: path.stem)
async def test_captured_payload(capture_path: Path) -> None:
    """Each manually approved capture remains an exact regression."""

    payload = json.loads(capture_path.read_text(encoding="utf-8"))
    SOURCE_PAYLOAD_ADAPTER.validate_python(payload)
    expected = _expectations().get(capture_path.name)
    extractor = RecipeEvidenceExtractor()
    if expected is not None and expected.get("text_selection") is not None:
        extractor = HybridTextExtractor(extractor, _ReviewedSelection(expected["text_selection"]))
    outcome = await ExtractionOrchestrator(ExtractionDependencies(
        extractor, LinguaLanguageDetector(), transcription_provider=None,
        audio_evidence_extractor=GeminiAudioEvidenceExtractor(),
    )).extract(payload)
    actual = outcome.model_dump(mode="json")

    assert actual["outcome"] in {"complete", "incomplete", "failed"}
    if expected is not None:
        detected_languages = list(dict.fromkeys(
            evidence["language"].get("code") or "undetermined"
            for evidence in actual["evidence"]
        ))
        expected_result = {key: value for key, value in expected.items() if key != "text_selection"}
        _assert_subset(expected_result, {
            "outcome": actual["outcome"],
            "issue_codes": actual.get("issue_codes", []),
            "reason": actual.get("reason"),
            "capture_errors": ", ".join(payload["capture"]["errors"]),
            "detected_languages": ", ".join(detected_languages),
            "recipe": _recipe_projection(actual.get("recipe")),
        })


def test_every_expectation_references_a_capture() -> None:
    capture_names = {path.name for path in _captures()}
    unknown = sorted(set(_expectations()) - capture_names)
    assert not unknown, f"expectations refer to missing captures: {unknown}"
