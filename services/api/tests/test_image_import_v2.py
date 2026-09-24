"""Image transcription and v2 import contracts, without external services."""

import base64
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from api.models import ImportJob, ImportJobKind, RecipeExtraction
from api.routes.imports import _validate_input
from api.models import ImportJobCreate
from api.services import gemini, import_worker
from api.services.extraction_v2 import production
from api.services.extraction_v2.evidence import reference_matches
from api.services.extraction_v2.contracts import (
    CompleteOutcome, EvidenceKind, EvidenceSource, ExtractedRecipe,
    FailureReason, FailedOutcome, ExtractionStage, IncompleteOutcome,
    IngredientEvidence, IssueCode, LanguageResult, RecipeComponentEvidence, StepEvidence,
)


def _job(image: bytes = b"image", mime_type: str = "image/jpeg") -> ImportJob:
    return ImportJob(kind=ImportJobKind.IMAGE, model="vision-test", input={
        "image_base64": base64.b64encode(image).decode(), "mime_type": mime_type,
    }, user_id=uuid4(), household_id=uuid4(), idempotency_key=str(uuid4()))


@pytest.mark.asyncio
async def test_vision_request_transcribes_only_once(monkeypatch):
    response = SimpleNamespace(text="Cake\nIngredients\n1 cup flour\n[unclear] eggs", usage_metadata=None)
    generate = Mock(return_value=response)
    monkeypatch.setattr(gemini, "_build_client", lambda: SimpleNamespace(models=SimpleNamespace(generate_content=generate)))

    text = await gemini.transcribe_image_text(b"pixels", "image/png", model="vision-test")

    assert text == response.text
    generate.assert_called_once()
    call = generate.call_args.kwargs
    assert call["model"] == "vision-test"
    assert call["contents"][0].inline_data.data == b"pixels"
    assert "reading order" in call["contents"][1]
    assert "do not" in call["contents"][1].lower()
    assert call["config"].response_mime_type == "text/plain"


@pytest.mark.asyncio
@pytest.mark.parametrize("source_text", [
    "Cookbook page\nBread\nIngredients\n1 cup flour\nSteps\nMix flour with water and bake.",
    "Screenshot\nPasta\nIngredients\n200 g pasta\nInstructions\nBoil the pasta until tender.",
    "Handwritten card\nSoup\nIngredients\n2 carrots\nSteps\nChop carrots and simmer.\n[unclear]",
])
async def test_image_worker_uses_v2_outcome_and_keeps_source(monkeypatch, source_text):
    vision_calls = []
    v2_calls = []

    async def transcribe(data, mime, model=None, usage=None):
        vision_calls.append((data, mime, model))
        return source_text

    async def extract(text, usage):
        v2_calls.append(text)
        return CompleteOutcome(outcome="complete", source_url="", evidence=[EvidenceSource(
            id="image_transcript:0", kind=EvidenceKind.IMAGE_TRANSCRIPT, source_url="",
            text=text, language=LanguageResult(code="en"),
        )], trace=[], recipe=ExtractedRecipe(title="Recipe", components=[RecipeComponentEvidence(
            ingredients=[IngredientEvidence(text="1 cup flour", evidence_ids=["image_transcript:0"])],
            steps=[StepEvidence(text="Mix and bake.", evidence_ids=["image_transcript:0"])],
        )]))

    async def enrich(recipe, tags, allergens, usage):
        return RecipeExtraction(title=recipe.title, components=[])

    monkeypatch.setattr(gemini, "transcribe_image_text", transcribe)
    monkeypatch.setattr(import_worker, "extract_image_transcript", extract)
    monkeypatch.setattr(import_worker, "_enrich_v2", enrich)
    result = await import_worker._run_pipeline(_job(), [], [])

    assert vision_calls == [(b"image", "image/jpeg", "vision-test")]
    assert v2_calls == [source_text]
    assert result.outcome == "complete"
    assert result.evidence[0]["kind"] == "image_transcript"
    assert result.source_capture["transcript"] == source_text
    assert base64.b64decode(result.source_capture["image_base64"]) == b"image"


@pytest.mark.asyncio
@pytest.mark.parametrize("transcript,reason", [
    ("", "unreadable_content"),
    ("A travel note about a mountain walk", "no_recipe_content"),
])
async def test_unreadable_and_no_recipe_fail_with_typed_codes(monkeypatch, transcript, reason):
    async def transcribe(*_args, **_kwargs):
        return transcript

    async def extract(text, usage):
        assert text == transcript
        return FailedOutcome(outcome="failed", source_url="", evidence=[], trace=[],
                             reason=FailureReason.NO_RECIPE_CONTENT, failed_stage=ExtractionStage.TEXT)

    monkeypatch.setattr(gemini, "transcribe_image_text", transcribe)
    monkeypatch.setattr(import_worker, "extract_image_transcript", extract)
    with pytest.raises(import_worker.ImportPipelineFailure) as error:
        await import_worker._run_pipeline(_job(), [], [])
    assert error.value.code == reason


def test_input_rejects_oversized_or_invalid_images():
    for data, mime in ((b"x" * (8 * 1024 * 1024 + 1), "image/jpeg"), (b"x", "text/plain")):
        body = ImportJobCreate(kind=ImportJobKind.IMAGE, input={
            "image_base64": base64.b64encode(data).decode(), "mime_type": mime,
        }, idempotency_key=uuid4())
        with pytest.raises(HTTPException) as error:
            _validate_input(body)
        assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_production_image_transcript_uses_v2_language_and_evidence(monkeypatch):
    monkeypatch.setattr(gemini, "_build_client", lambda: (_ for _ in ()).throw(AssertionError("unexpected model request")))
    text = "Bread\nIngredients\n1 cup flour\nInstructions\nMix flour and water, then bake."
    outcome = await production.extract_image_transcript(text, gemini.UsageTracker())
    assert outcome.outcome == "complete", outcome.model_dump(mode="json")
    assert outcome.evidence[0].kind == EvidenceKind.IMAGE_TRANSCRIPT
    assert outcome.evidence[0].text == text
    assert [event.event for event in outcome.trace] == ["image_transcript_received", "image_transcript_extracted", "complete"]
    assert outcome.recipe.components[0].ingredients[0].evidence_ids == ["image_transcript:0"]
    assert outcome.recipe.title == "Bread"
    assert reference_matches(outcome.recipe.title_references[0], text)


@pytest.mark.asyncio
async def test_image_title_after_ingredients_is_grounded_without_inventing_total_time(monkeypatch):
    monkeypatch.setattr(gemini, "_build_client", lambda: (_ for _ in ()).throw(AssertionError("unexpected model request")))
    text = (
        "INGREDIENTS\n1 sweet potato\na pinch of salt\n3 eggs\n\n"
        "Sweet potato bowl\n\n2 servings 15 minutes\n\nDIRECTIONS\n"
        "Roast the sweet potato.\nCook the eggs.\nServe in a bowl."
    )
    outcome = await production.extract_image_transcript(text, gemini.UsageTracker())
    assert outcome.outcome == "complete", outcome.model_dump(mode="json")
    assert outcome.recipe.title == "Sweet potato bowl"
    assert reference_matches(outcome.recipe.title_references[0], text)
    assert outcome.recipe.total_time_minutes is None


@pytest.mark.asyncio
async def test_split_image_title_joins_adjacent_heading_lines_with_two_references(monkeypatch):
    monkeypatch.setattr(gemini, "_build_client", lambda: (_ for _ in ()).throw(AssertionError("unexpected model request")))
    text = (
        "THE PANCAKE\nRECIPE\n\nIngredients:\n1 cup flour\n2 eggs\n"
        "Instructions:\nMix flour and eggs.\nCook the batter in a pan."
    )
    outcome = await production.extract_image_transcript(text, gemini.UsageTracker())
    assert outcome.outcome == "complete", outcome.model_dump(mode="json")
    assert outcome.recipe.title == "THE PANCAKE RECIPE"
    assert [ref.quote for ref in outcome.recipe.title_references] == ["THE PANCAKE", "RECIPE"]
    assert all(reference_matches(ref, text) for ref in outcome.recipe.title_references)


@pytest.mark.asyncio
async def test_image_title_does_not_join_unrelated_prose(monkeypatch):
    monkeypatch.setattr(gemini, "_build_client", lambda: (_ for _ in ()).throw(AssertionError("unexpected model request")))
    text = (
        "A recipe from my grandmother\nTomato Soup\nIngredients:\n2 tomatoes\n"
        "Instructions:\nChop the tomatoes and simmer."
    )
    outcome = await production.extract_image_transcript(text, gemini.UsageTracker())
    assert outcome.outcome == "complete", outcome.model_dump(mode="json")
    assert outcome.recipe.title == "Tomato Soup"
    assert len(outcome.recipe.title_references) == 1


@pytest.mark.asyncio
async def test_long_transcript_fails_without_losing_text(monkeypatch):
    async def transcribe(*_args, **_kwargs):
        return "visible text\n" * 2000

    monkeypatch.setattr(gemini, "transcribe_image_text", transcribe)
    with pytest.raises(import_worker.ImportPipelineFailure) as error:
        await import_worker._run_pipeline(_job(), [], [])
    assert error.value.code == "invalid_input"
    assert error.value.stage == "transcript"


@pytest.mark.asyncio
async def test_partial_image_recipe_keeps_v2_issue_and_outcome(monkeypatch):
    async def transcribe(*_args, **_kwargs):
        return "Ingredients\n1 cup flour"

    async def extract(text, usage):
        return IncompleteOutcome(outcome="incomplete", source_url="", evidence=[EvidenceSource(
            id="image_transcript:0", kind=EvidenceKind.IMAGE_TRANSCRIPT, source_url="",
            text=text, language=LanguageResult(code="en"),
        )], trace=[], recipe=ExtractedRecipe(components=[RecipeComponentEvidence(
            ingredients=[IngredientEvidence(text="1 cup flour", evidence_ids=["image_transcript:0"])],
        )]), issue_codes=[IssueCode.MISSING_INSTRUCTIONS])

    async def enrich(*_args):
        return RecipeExtraction(title="Flour", components=[])

    monkeypatch.setattr(gemini, "transcribe_image_text", transcribe)
    monkeypatch.setattr(import_worker, "extract_image_transcript", extract)
    monkeypatch.setattr(import_worker, "_enrich_v2", enrich)
    result = await import_worker._run_pipeline(_job(), [], [])
    assert result.outcome == "incomplete"
    assert result.issue_codes == ["MISSING_INSTRUCTIONS"]
