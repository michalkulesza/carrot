from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from api.services.extraction_v2.contracts import (
    AudioExtractionInput,
    EvidenceKind,
    ExtractedRecipe,
    ExtractionInput,
    FailureReason,
    IngredientEvidence,
    LanguageResult,
    RecipeComponentEvidence,
    StepEvidence,
)
from api.services.extraction_v2.orchestrator import ExtractionDependencies, ExtractionOrchestrator
from api.services.extraction_v2.adapters import _ground_transcript_wording
from api.services.extraction_v2.sources import LinkedPage


def _ingredient(text: str, evidence_id: str) -> IngredientEvidence:
    return IngredientEvidence(text=text, evidence_ids=[evidence_id])


def _step(text: str, evidence_id: str) -> StepEvidence:
    return StepEvidence(text=text, evidence_ids=[evidence_id])


def _recipe(*, ingredients: list[IngredientEvidence] | None = None, steps: list[StepEvidence] | None = None, title: str | None = None) -> ExtractedRecipe:
    return ExtractedRecipe(title=title, components=[RecipeComponentEvidence(ingredients=ingredients or [], steps=steps or [])])


class FakeLanguageDetector:
    def detect(self, text: str) -> LanguageResult:
        if "CYRILLIC" in text:
            return LanguageResult(code="ru", confidence=0.99)
        if "UNCERTAIN" in text:
            return LanguageResult(confidence=0.4)
        return LanguageResult(code="en", confidence=0.99)


@dataclass
class FakeExtractor:
    text_result: ExtractedRecipe = field(default_factory=ExtractedRecipe)
    html_result: ExtractedRecipe = field(default_factory=ExtractedRecipe)
    text_inputs: list[ExtractionInput] = field(default_factory=list)
    html_inputs: list[ExtractionInput] = field(default_factory=list)

    async def extract_text(self, source: ExtractionInput) -> ExtractedRecipe:
        self.text_inputs.append(source)
        return self.text_result.model_copy(deep=True)

    async def extract_html(self, source: ExtractionInput) -> ExtractedRecipe:
        self.html_inputs.append(source)
        return self.html_result.model_copy(deep=True)


@dataclass
class FakePages:
    pages: dict[str, LinkedPage]
    calls: list[str] = field(default_factory=list)

    async def fetch(self, url: str) -> LinkedPage:
        self.calls.append(url)
        return self.pages[url]


@dataclass
class FakeAudioExtractor:
    result: ExtractedRecipe
    calls: list[AudioExtractionInput] = field(default_factory=list)

    async def extract_audio(self, source: AudioExtractionInput) -> ExtractedRecipe:
        self.calls.append(source)
        return self.result.model_copy(deep=True)


def _social_payload(description: str, **overrides) -> dict:
    payload = {
        "schema_version": 1,
        "kind": "social",
        "source_url": "https://www.instagram.com/reel/example/",
        "capture": {"status": "complete", "errors": []},
        "scrapecreators_response": {
            "data": {"xdt_shortcode_media": {
                "edge_media_to_caption": {"edges": [{"node": {"text": description}}]},
                "owner": {"username": "carrotcook"},
            }},
        },
        "comments": [],
        "audio": {"status": "unavailable"},
    }
    payload.update(overrides)
    return payload


def test_audio_wording_reuses_the_exact_transcript_for_mojibake_only() -> None:
    transcript = "Następnie dolewacie 365 g zimnej wody i sypiecie 1 g drożdży suchych."

    assert _ground_transcript_wording(
        "dolewacie 365 g zimnej wody i sypiecie 1 g droŸdŸy suchych.", transcript,
    ) == "dolewacie 365 g zimnej wody i sypiecie 1 g drożdży suchych."
    assert _ground_transcript_wording("Dodaj cukier.", transcript) == "Dodaj cukier."


def test_audio_wording_repairs_replacement_char_and_keeps_short_sentence_leadin() -> None:
    assert _ground_transcript_wording(
        "Saut� your onion", "Sauté your onion before adding the beef."
    ) == "Sauté your onion"
    assert _ground_transcript_wording(
        "wsypujecie 500 g mąki, typ 650 i 9 g soli",
        "Do miski wsypujecie 500 g mąki, typ 650 i 9 g soli.",
        include_sentence_leadin=True,
    ) == "Do miski wsypujecie 500 g mąki, typ 650 i 9 g soli."
    assert _ground_transcript_wording("az\ufffdcar", "mezclar el azúcar con limón") == "azúcar"
    assert _ground_transcript_wording("Saut\ufffd", "Sauter") == "Saut\ufffd"
    assert _ground_transcript_wording("1 onion", "Add 1 onion.") == "1 onion"


def test_audio_wording_does_not_guess_ambiguous_or_unmatched_quotes() -> None:
    assert _ground_transcript_wording("� rice", "onion rice") == "� rice"
    assert _ground_transcript_wording("Saut� rice", "Sauté your onion") == "Saut� rice"
    transcript = "A lengthy preamble that is not part of this instruction. " + (
        "This clause has a sufficiently long lead-in before it starts here"
    )
    assert _ground_transcript_wording("starts here", transcript, include_sentence_leadin=True) == "starts here"


@pytest.mark.asyncio
async def test_html_is_cleaned_before_source_agnostic_extraction() -> None:
    extractor = FakeExtractor(html_result=_recipe(
        ingredients=[_ingredient("1 onion", "html:0")], steps=[_step("Cook it.", "html:0")],
    ))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector()))

    outcome = await orchestrator.extract({
        "schema_version": 1, "kind": "html", "source_url": "https://example.com/recipe",
        "capture": {"status": "complete", "errors": []},
        "html": "<main><h1>Soup</h1><ul><li>1 onion</li></ul><script>bad()</script></main>",
    })

    assert outcome.outcome == "complete"
    assert "<main>" in extractor.html_inputs[0].content
    assert "bad()" not in extractor.html_inputs[0].content


@pytest.mark.asyncio
async def test_complete_social_text_skips_link_and_audio_fallbacks() -> None:
    extractor = FakeExtractor(text_result=_recipe(
        ingredients=[_ingredient("salt to taste", "caption:0")], steps=[_step("Serve.", "caption:0")],
    ))
    pages = FakePages({})
    audio = FakeAudioExtractor(ExtractedRecipe())
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector(), pages, audio_evidence_extractor=audio))

    outcome = await orchestrator.extract(_social_payload("Ingredients: salt to taste. Instructions: serve. https://example.com/full"))

    assert outcome.outcome == "complete"
    assert pages.calls == []
    assert audio.calls == []


@pytest.mark.asyncio
async def test_only_verified_creator_comments_are_sent_to_text_extraction() -> None:
    extractor = FakeExtractor(text_result=_recipe(ingredients=[_ingredient("1 onion", "caption:0")]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector()))
    payload = _social_payload("Ingredients: 1 onion", comments=[
        {
            "id": "creator", "author_handle": "@CarrotCook", "text": "Bake for 20 minutes",
            "is_creator_authored": True, "authorship_evidence": "provider_creator_flag",
        },
        {
            "id": "viewer", "author_handle": "viewer", "text": "Use a lot of sugar",
            "is_creator_authored": True, "authorship_evidence": "provider_creator_flag",
        },
    ])

    outcome = await orchestrator.extract(payload)

    assert outcome.outcome == "incomplete"
    assert "Bake for 20 minutes" in extractor.text_inputs[0].content
    assert "Use a lot of sugar" not in extractor.text_inputs[0].content
    assert any(event.event == "comment_excluded" for event in outcome.trace)


@pytest.mark.asyncio
async def test_linked_html_precedes_and_can_avoid_audio() -> None:
    extractor = FakeExtractor(
        text_result=_recipe(ingredients=[_ingredient("1 onion", "caption:0")]),
        html_result=_recipe(steps=[_step("Cook the onion.", "linked_page:0")]),
    )
    page_url = "https://example.com/full"
    pages = FakePages({page_url: LinkedPage(page_url, page_url, "<main>Instructions: Cook the onion.</main>")})
    audio = FakeAudioExtractor(_recipe(steps=[_step("unused", "transcript:0")]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector(), pages, audio_evidence_extractor=audio))

    outcome = await orchestrator.extract(_social_payload(f"Ingredients: 1 onion {page_url}", audio={"status": "transcribed", "transcript": "audio"}))

    assert outcome.outcome == "complete"
    assert pages.calls == [page_url]
    assert audio.calls == []
    assert outcome.recipe.components[0].ingredients[0].evidence_ids == ["caption:0"]
    assert outcome.recipe.components[0].steps[0].evidence_ids == ["linked_page:0"]


@pytest.mark.asyncio
async def test_audio_merges_with_retained_partial_evidence() -> None:
    extractor = FakeExtractor(text_result=_recipe(ingredients=[_ingredient("1 onion", "caption:0")]))
    audio = FakeAudioExtractor(_recipe(steps=[_step("Cook the onion.", "transcript:0")]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector(), audio_evidence_extractor=audio))

    outcome = await orchestrator.extract(_social_payload("Ingredients: 1 onion", audio={"status": "transcribed", "transcript": "Cook the onion."}))

    assert outcome.outcome == "complete"
    assert len(audio.calls) == 1
    assert audio.calls[0].retained_recipe.components[0].ingredients[0].text == "1 onion"
    assert {source.kind for source in outcome.evidence} == {EvidenceKind.CAPTION, EvidenceKind.TRANSCRIPT}


@pytest.mark.asyncio
async def test_unanchored_partial_audio_does_not_create_an_unrelated_recipe() -> None:
    extractor = FakeExtractor()
    audio = FakeAudioExtractor(_recipe(ingredients=[_ingredient("one cup of sugar", "transcript:0")]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector(), audio_evidence_extractor=audio))

    outcome = await orchestrator.extract(_social_payload(
        "A video with no recipe details.",
        audio={"status": "transcribed", "transcript": "Make one cup of sugar syrup."},
    ))

    assert outcome.outcome == "failed"
    assert outcome.reason == FailureReason.NO_RECIPE_CONTENT
    assert any(event.event == "unanchored_partial_audio_ignored" for event in outcome.trace)


@pytest.mark.asyncio
async def test_audio_does_not_add_ingredients_when_earlier_evidence_has_any() -> None:
    extractor = FakeExtractor(text_result=_recipe(ingredients=[
        _ingredient("1 teaspoon onion powder", "caption:0"),
        _ingredient("5 rice paper sheets", "caption:0"),
    ]))
    audio = FakeAudioExtractor(_recipe(ingredients=[
        _ingredient("onion powder", "transcript:0"),
        _ingredient("rice paper", "transcript:0"),
        _ingredient("avocado oil", "transcript:0"),
    ], steps=[_step("Air fry until crisp.", "transcript:0")]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector(), audio_evidence_extractor=audio))

    outcome = await orchestrator.extract(_social_payload(
        "Ingredients: 1 teaspoon onion powder; 5 rice paper sheets",
        audio={"status": "transcribed", "transcript": "Use onion powder, rice paper, and avocado oil. Air fry until crisp."},
    ))

    assert outcome.outcome == "complete"
    assert [item.text for item in outcome.recipe.components[0].ingredients] == [
        "1 teaspoon onion powder", "5 rice paper sheets",
    ]


@pytest.mark.asyncio
async def test_audio_adds_ingredients_but_not_steps_when_earlier_evidence_has_steps() -> None:
    extractor = FakeExtractor(text_result=_recipe(steps=[_step("Cook the filling.", "caption:0")]))
    audio = FakeAudioExtractor(_recipe(
        ingredients=[_ingredient("1 avocado", "transcript:0")],
        steps=[_step("Air fry until crisp.", "transcript:0")],
    ))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector(), audio_evidence_extractor=audio))

    outcome = await orchestrator.extract(_social_payload(
        "Instructions: Cook the filling.",
        audio={"status": "transcribed", "transcript": "Use 1 avocado. Air fry until crisp."},
    ))

    assert outcome.outcome == "complete"
    assert [item.text for item in outcome.recipe.components[0].ingredients] == ["1 avocado"]
    assert [item.text for item in outcome.recipe.components[0].steps] == ["Cook the filling."]


@pytest.mark.asyncio
async def test_unsupported_transcript_does_not_discard_supported_partial_text() -> None:
    extractor = FakeExtractor(text_result=_recipe(steps=[_step("Cook the onion.", "caption:0")]))
    audio = FakeAudioExtractor(_recipe(ingredients=[_ingredient("1 onion", "transcript:0")]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(
        extractor, FakeLanguageDetector(), audio_evidence_extractor=audio,
    ))

    outcome = await orchestrator.extract(_social_payload(
        "Instructions: Cook the onion.",
        audio={"status": "transcribed", "transcript": "CYRILLIC translation"},
    ))

    assert outcome.outcome == "incomplete"
    assert outcome.issue_codes == ["MISSING_INGREDIENTS"]
    assert audio.calls == []
    assert any(event.event == "unsupported_secondary_ignored" for event in outcome.trace)


@pytest.mark.asyncio
async def test_unsupported_language_stops_before_extraction() -> None:
    extractor = FakeExtractor()
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector()))

    outcome = await orchestrator.extract(_social_payload("CYRILLIC recipe content"))

    assert outcome.outcome == "failed"
    assert outcome.reason == FailureReason.UNSUPPORTED_LANGUAGE
    assert extractor.text_inputs == []


@pytest.mark.asyncio
async def test_supported_spanish_transcript_supersedes_unsupported_sparse_caption() -> None:
    class Detector:
        def detect(self, text: str) -> LanguageResult:
            if "CAPTION_IN_UNSUPPORTED_LANGUAGE" in text:
                return LanguageResult(code="ru", confidence=0.99)
            if "TRANSCRIPCION_EN_ESPANOL" in text:
                return LanguageResult(code="es", confidence=0.99)
            return LanguageResult()

    extractor = FakeExtractor()
    audio = FakeAudioExtractor(_recipe(
        ingredients=[_ingredient("2 tomates", "transcript:0")],
        steps=[_step("Corta los tomates.", "transcript:0")],
    ))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(
        extractor, Detector(), audio_evidence_extractor=audio,
    ))

    outcome = await orchestrator.extract(_social_payload(
        "CAPTION_IN_UNSUPPORTED_LANGUAGE",
        audio={"status": "transcribed", "transcript": "TRANSCRIPCION_EN_ESPANOL"},
    ))

    assert outcome.outcome == "complete"
    assert extractor.text_inputs == []
    assert len(audio.calls) == 1
    assert outcome.evidence[-1].language.code == "es"
    assert any(event.event == "unsupported_language_deferred_for_audio" for event in outcome.trace)


@pytest.mark.asyncio
async def test_unsupported_transcript_does_not_supersede_deferred_caption_failure() -> None:
    extractor = FakeExtractor()
    audio = FakeAudioExtractor(_recipe(
        ingredients=[_ingredient("1 tomato", "transcript:0")],
        steps=[_step("Cook it.", "transcript:0")],
    ))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(
        extractor, FakeLanguageDetector(), audio_evidence_extractor=audio,
    ))

    outcome = await orchestrator.extract(_social_payload(
        "CYRILLIC caption",
        audio={"status": "transcribed", "transcript": "CYRILLIC transcript"},
    ))

    assert outcome.outcome == "failed"
    assert outcome.reason == FailureReason.UNSUPPORTED_LANGUAGE
    assert extractor.text_inputs == []
    assert audio.calls == []
    assert {source.kind for source in outcome.evidence} == {EvidenceKind.CAPTION, EvidenceKind.TRANSCRIPT}


@pytest.mark.asyncio
async def test_supported_caption_ignores_a_later_unsupported_language_block() -> None:
    class Detector:
        def detect(self, text: str) -> LanguageResult:
            if "SECONDARY_LANGUAGE" in text:
                return LanguageResult(code="ru", confidence=0.99)
            return LanguageResult(code="en", confidence=0.99)

    extractor = FakeExtractor(text_result=_recipe(steps=[_step("Cook the onion.", "caption:0")]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, Detector()))

    outcome = await orchestrator.extract(_social_payload(
        "Ingredients are mixed into these directions.\n1. Cook the onion.\n\n"
        "SECONDARY_LANGUAGE translated copy that should be ignored.",
    ))

    assert outcome.outcome == "incomplete"
    assert outcome.issue_codes == ["MISSING_INGREDIENTS"]
    # Frozen review selections use physical source line IDs, so source layout is
    # retained even though the secondary block is excluded from language gating.
    assert "SECONDARY_LANGUAGE" in extractor.text_inputs[0].content
    assert outcome.evidence[0].language.code == "en"
    assert any(event.event == "unsupported_secondary_ignored" for event in outcome.trace)


@pytest.mark.asyncio
async def test_invalid_payload_does_not_call_dependencies() -> None:
    extractor = FakeExtractor()
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector()))

    outcome = await orchestrator.extract({"schema_version": 2, "kind": "html"})

    assert outcome.outcome == "failed"
    assert outcome.reason == FailureReason.INVALID_INPUT
    assert extractor.html_inputs == []
    assert extractor.text_inputs == []


@pytest.mark.asyncio
async def test_audio_model_failure_keeps_usable_partial_recipe() -> None:
    class FailingAudioExtractor:
        async def extract_audio(self, source: AudioExtractionInput) -> ExtractedRecipe:
            raise ValueError("malformed model response")

    extractor = FakeExtractor(text_result=_recipe(ingredients=[_ingredient("1 onion", "caption:0")]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector(), audio_evidence_extractor=FailingAudioExtractor()))

    outcome = await orchestrator.extract(_social_payload("Ingredients: 1 onion", audio={"status": "transcribed", "transcript": "Cook it."}))

    assert outcome.outcome == "incomplete"
    assert outcome.issue_codes == ["MISSING_INSTRUCTIONS"]


@pytest.mark.asyncio
async def test_rejects_facts_that_reference_unprovided_evidence() -> None:
    extractor = FakeExtractor(text_result=_recipe(ingredients=[_ingredient("1 onion", "viewer_comment:0")]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor, FakeLanguageDetector()))

    outcome = await orchestrator.extract(_social_payload("Ingredients: 1 onion"))

    assert outcome.outcome == "failed"
    assert outcome.reason == FailureReason.INVALID_MODEL_RESPONSE
