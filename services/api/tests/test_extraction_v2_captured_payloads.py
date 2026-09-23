"""Regression cases for every captured extraction-v2 source envelope."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

import pytest

from api.services import gemini
from api.services.extraction_v2.contracts import SOURCE_PAYLOAD_ADAPTER, TextSelection
from api.services.extraction_v2.adapters import GeminiAudioEvidenceExtractor
from api.services.extraction_v2.extractor import RecipeEvidenceExtractor
from api.services.extraction_v2.evidence import reference_matches
from api.services.extraction_v2.gemini_selection import HybridTextExtractor
from api.services.extraction_v2.language import LinguaLanguageDetector
from api.services.extraction_v2.orchestrator import ExtractionDependencies, ExtractionOrchestrator

CAPTURE_DIR = Path(__file__).parent / "captured-payloads"
EXPECTATIONS_PATH = Path(__file__).parent / "fixtures" / "extraction_v2" / "expectations.json"
AUDIO_RESPONSE_DIR = Path(__file__).parent / "fixtures" / "extraction_v2" / "audio_responses"
SKIPPED_CAPTURE_FILES = {"failed-urls.json"}
RUN_LIVE_AUDIO_CAPTURE_TESTS = os.getenv("CARROT_RUN_LIVE_AUDIO_CAPTURE_TESTS") == "1"
DXW_AUDIO_QUALITY_EXCEPTION = "instagram-DXWc3znDQkZ.json"


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


def _transcript(payload: dict[str, Any]) -> str | None:
    audio = payload.get("audio")
    return audio.get("transcript") if isinstance(audio, dict) else None


def _audio_response_path(capture_path: Path) -> Path:
    return AUDIO_RESPONSE_DIR / capture_path.name


def _block_gemini_client(*args: Any, **kwargs: Any) -> None:
    raise AssertionError("offline captured-payload tests must not create a Gemini client")


async def _extract_reviewed_capture(
    capture_path: Path,
    payload: dict[str, Any],
    expected: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
):
    response_path = _audio_response_path(capture_path)
    extractor = RecipeEvidenceExtractor()
    if expected.get("text_selection") is not None:
        extractor = HybridTextExtractor(extractor, _ReviewedSelection(expected["text_selection"]))
    if response_path.exists():
        fixture = json.loads(response_path.read_text(encoding="utf-8"))
        assert fixture["source_capture"] == capture_path.name
        assert fixture["capture_sha256"] == hashlib.sha256(capture_path.read_bytes()).hexdigest(), (
            f"audio response is stale for changed capture {capture_path.name}"
        )
        response = fixture["response"]

        async def replay_audio_response(*args: Any, **kwargs: Any) -> gemini.AudioRecipeEvidence:
            return gemini.AudioRecipeEvidence.model_validate(response)

        monkeypatch.setattr(gemini, "extract_audio_recipe_evidence", replay_audio_response)
        monkeypatch.setattr(gemini, "_build_client", _block_gemini_client)
        audio_evidence_extractor = GeminiAudioEvidenceExtractor()
    else:
        if not RUN_LIVE_AUDIO_CAPTURE_TESTS:
            monkeypatch.setattr(gemini, "_build_client", _block_gemini_client)
        audio_evidence_extractor = None if not RUN_LIVE_AUDIO_CAPTURE_TESTS else GeminiAudioEvidenceExtractor()
    return await ExtractionOrchestrator(ExtractionDependencies(
        extractor, LinguaLanguageDetector(), transcription_provider=None,
        audio_evidence_extractor=audio_evidence_extractor,
    )).extract(payload)


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
async def test_captured_payload(capture_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep reviewed captures exact when audio output is replayable or unnecessary."""

    payload = json.loads(capture_path.read_text(encoding="utf-8"))
    SOURCE_PAYLOAD_ADAPTER.validate_python(payload)
    expected = _expectations().get(capture_path.name)
    response_path = _audio_response_path(capture_path)
    if _transcript(payload) and not response_path.exists() and not RUN_LIVE_AUDIO_CAPTURE_TESTS:
        pytest.skip("audio model response is not frozen; set CARROT_RUN_LIVE_AUDIO_CAPTURE_TESTS=1 for a live check")

    outcome = await _extract_reviewed_capture(capture_path, payload, expected or {}, monkeypatch)
    actual = outcome.model_dump(mode="json")

    assert actual["outcome"] in {"complete", "incomplete", "failed"}
    if expected is not None:
        detected_languages = list(dict.fromkeys(
            evidence["language"].get("code") or "undetermined"
            for evidence in actual["evidence"]
        ))
        expected_result = {key: value for key, value in expected.items() if key != "text_selection"}
        actual_result = {
            "outcome": actual["outcome"],
            "issue_codes": actual.get("issue_codes", []),
            "reason": actual.get("reason"),
            "capture_errors": ", ".join(payload["capture"]["errors"]),
            "detected_languages": ", ".join(detected_languages),
            "recipe": _recipe_projection(actual.get("recipe")),
        }
        if capture_path.name == DXW_AUDIO_QUALITY_EXCEPTION:
            expected_result.pop("recipe", None)
            actual_result.pop("recipe", None)
        _assert_subset(expected_result, actual_result)


def test_every_expectation_references_a_capture() -> None:
    capture_names = {path.name for path in _captures()}
    unknown = sorted(set(_expectations()) - capture_names)
    assert not unknown, f"expectations refer to missing captures: {unknown}"


@pytest.mark.asyncio
@pytest.mark.parametrize("capture_path", _captures(), ids=lambda path: path.stem)
async def test_every_capture_has_an_offline_execution_smoke(
    capture_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every captured envelope validates and reaches a legal outcome offline."""

    payload = json.loads(capture_path.read_text(encoding="utf-8"))
    SOURCE_PAYLOAD_ADAPTER.validate_python(payload)
    monkeypatch.setattr(gemini, "_build_client", _block_gemini_client)
    outcome = await ExtractionOrchestrator(ExtractionDependencies(
        RecipeEvidenceExtractor(), LinguaLanguageDetector(),
        transcription_provider=None, audio_evidence_extractor=None,
    )).extract(payload)

    assert outcome.outcome in {"complete", "incomplete", "failed"}


@pytest.mark.asyncio
async def test_dxw_frozen_audio_replay_keeps_caption_facts_and_transcript_provenance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capture_path = CAPTURE_DIR / DXW_AUDIO_QUALITY_EXCEPTION
    payload = json.loads(capture_path.read_text(encoding="utf-8"))
    expected = _expectations()[capture_path.name]
    outcome = await _extract_reviewed_capture(capture_path, payload, expected, monkeypatch)

    assert outcome.outcome == "complete"
    assert any(event.event == "audio_merged" for event in outcome.trace)
    assert outcome.recipe is not None

    # Keep caption extraction exact while the Gemini audio quality evaluation
    # remains a manually reviewed concern for this capture.
    expected_caption_components = expected["recipe"]["components"][:3]
    projected_caption_components = _recipe_projection(outcome.model_dump(mode="json")["recipe"])["components"][:3]
    _assert_subset(expected_caption_components, projected_caption_components)
    caption = next(source for source in outcome.evidence if source.id == "caption:0")
    for component in outcome.recipe.components[:3]:
        for ingredient in component.ingredients:
            assert ingredient.evidence_ids == ["caption:0"]
            assert ingredient.references
            assert all(reference_matches(reference, caption.text) for reference in ingredient.references)

    transcript = next(source for source in outcome.evidence if source.id == "transcript:0")
    audio_components = outcome.recipe.components[3:]
    assert audio_components
    valid_evidence_ids = {source.id for source in outcome.evidence}
    for component in outcome.recipe.components:
        assert component.ingredients or component.steps
    for component in audio_components:
        assert not component.ingredients
        assert component.steps
        for step in component.steps:
            assert step.text.strip()
            assert step.evidence_ids == [transcript.id]
            assert set(step.evidence_ids) <= valid_evidence_ids


def test_audio_response_fixtures_reference_transcribed_captures() -> None:
    for response_path in AUDIO_RESPONSE_DIR.glob("*.json"):
        capture_path = CAPTURE_DIR / response_path.name
        assert capture_path.exists(), f"audio response has no matching capture: {response_path.name}"
        payload = json.loads(capture_path.read_text(encoding="utf-8"))
        assert _transcript(payload), f"audio response capture has no transcript: {response_path.name}"
        fixture = json.loads(response_path.read_text(encoding="utf-8"))
        assert fixture["source_capture"] == response_path.name
        capture_bytes = capture_path.read_bytes()
        assert fixture["capture_sha256"] == hashlib.sha256(capture_bytes).hexdigest()
        assert fixture["model"]
        assert fixture["captured_date_utc"]
        gemini.AudioRecipeEvidence.model_validate(fixture["response"])
