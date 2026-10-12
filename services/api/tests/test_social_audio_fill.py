from __future__ import annotations

import pytest

from api.services.extraction_v2.contracts import (
    ExtractedRecipe,
    IngredientEvidence,
    RecipeComponentEvidence,
    StepEvidence,
)
from api.services.extraction_v2.language import LinguaLanguageDetector
from api.services.extraction_v2.orchestrator import ExtractionDependencies, ExtractionOrchestrator
from test_extraction_orchestrator import FakeAudioExtractor, FakeExtractor, FakePages, _social_payload

CAPTION = (
    "Rosca de Laranja \U0001F34A\n\n\U0001F34Aingredientes\n3 ovos\n1 copo americano de açúcar\n"
    "1 laranja com casca\n\n\U0001F34A calda\nSuco de 1 laranja\n3 colheres de açúcar\n"
)
TRANSCRIPT = (
    "Gente, hoje eu vou ensinar a rosca de laranja. Primeiro bata no liquidificador os ovos, o açúcar "
    "e a laranja com casca. Depois leve ao forno por quarenta minutos. Para a calda, leve o suco da laranja "
    "com açúcar ao fogo até engrossar."
)


def _ing(text: str, source: str = "caption:0") -> IngredientEvidence:
    return IngredientEvidence(text=text, evidence_ids=[source])


def _step(text: str) -> StepEvidence:
    return StepEvidence(text=text, evidence_ids=["transcript:0"])


def _caption_recipe() -> ExtractedRecipe:
    return ExtractedRecipe(components=[
        RecipeComponentEvidence(name="Massa", ingredients=[_ing("3 ovos"), _ing("1 copo americano de açúcar")]),
        RecipeComponentEvidence(name="Calda", ingredients=[_ing("Suco de 1 laranja")]),
    ])


def _orchestrator(audio_result: ExtractedRecipe, *, detector=None, extractor=None):
    extractor = extractor or FakeExtractor(text_result=_caption_recipe())
    audio = FakeAudioExtractor(audio_result)
    pages = FakePages({})
    deps = ExtractionDependencies(extractor, detector or LinguaLanguageDetector(), pages, audio_evidence_extractor=audio)
    return ExtractionOrchestrator(deps), extractor, audio, pages


def _payload(**audio):
    return _social_payload(CAPTION, audio={"status": "transcribed", "transcript": TRANSCRIPT, **audio})


@pytest.mark.asyncio
async def test_caption_ingredients_under_headings_get_steps_from_audio_unnamed_component() -> None:
    audio_result = ExtractedRecipe(components=[RecipeComponentEvidence(steps=[
        _step("Primeiro bata no liquidificador os ovos."), _step("Depois leve ao forno por quarenta minutos."),
    ])])
    orchestrator, _, audio, _ = _orchestrator(audio_result)

    outcome = await orchestrator.extract(_payload())

    assert outcome.outcome == "complete"
    assert len(audio.calls) == 1
    names = [c.name for c in outcome.recipe.components if c.ingredients]
    assert names == ["Massa", "Calda"]
    assert sum(len(c.steps) for c in outcome.recipe.components) == 2
    assert any(e.event == "audio_merged" for e in outcome.trace)
    assert {s.id for s in outcome.evidence} >= {"transcript:0"}


@pytest.mark.asyncio
async def test_audio_steps_grouped_by_component_attach_to_matching_caption_components() -> None:
    audio_result = ExtractedRecipe(components=[
        RecipeComponentEvidence(name="massa", steps=[_step("Bata no liquidificador.")]),
        RecipeComponentEvidence(name="Calda", steps=[_step("Leve ao fogo até engrossar.")]),
    ])
    orchestrator, _, _, _ = _orchestrator(audio_result)

    outcome = await orchestrator.extract(_payload())

    assert outcome.outcome == "complete"
    by_name = {c.name: c for c in outcome.recipe.components}
    assert [i.text for i in by_name["Massa"].ingredients] == ["3 ovos", "1 copo americano de açúcar"]
    assert [s.text for s in by_name["Massa"].steps] == ["Bata no liquidificador."]
    assert [s.text for s in by_name["Calda"].steps] == ["Leve ao fogo até engrossar."]
    assert len(outcome.recipe.components) == 2


@pytest.mark.asyncio
async def test_caption_ingredients_stay_authoritative_over_audio_ingredients() -> None:
    audio_result = ExtractedRecipe(components=[RecipeComponentEvidence(
        ingredients=[_ing("três ovos", "transcript:0")], steps=[_step("Bata tudo.")],
    )])
    orchestrator, _, _, _ = _orchestrator(audio_result)

    outcome = await orchestrator.extract(_payload())

    assert outcome.outcome == "complete"
    texts = [i.text for c in outcome.recipe.components for i in c.ingredients]
    assert texts == ["3 ovos", "1 copo americano de açúcar", "Suco de 1 laranja"]


@pytest.mark.asyncio
async def test_complete_caption_makes_no_audio_or_link_calls() -> None:
    full = _caption_recipe()
    full.components[0].steps = [StepEvidence(text="Asse.", evidence_ids=["caption:0"])]
    orchestrator, extractor, audio, pages = _orchestrator(ExtractedRecipe(), extractor=FakeExtractor(text_result=full))

    outcome = await orchestrator.extract(_payload())

    assert outcome.outcome == "complete"
    assert audio.calls == [] and pages.calls == []
    assert len(extractor.text_inputs) == 1


@pytest.mark.asyncio
async def test_video_url_is_transcribed_once_then_used_for_missing_steps() -> None:
    class Transcriber:
        calls = 0

        async def transcribe(self, video_url: str) -> str:
            Transcriber.calls += 1
            return TRANSCRIPT

    audio = FakeAudioExtractor(ExtractedRecipe(components=[RecipeComponentEvidence(steps=[_step("Bata tudo.")])]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(
        FakeExtractor(text_result=_caption_recipe()), LinguaLanguageDetector(),
        transcription_provider=Transcriber(), audio_evidence_extractor=audio,
    ))

    outcome = await orchestrator.extract(_social_payload(
        CAPTION, audio={"status": "available", "video_url": "https://cdn.example.com/v.mp4"},
    ))

    assert outcome.outcome == "complete"
    assert Transcriber.calls == 1 and len(audio.calls) == 1
    assert any(e.event == "transcribed" for e in outcome.trace)


@pytest.mark.asyncio
async def test_missing_audio_is_traced_when_caption_has_no_steps() -> None:
    orchestrator, _, audio, _ = _orchestrator(ExtractedRecipe())

    outcome = await orchestrator.extract(_social_payload(CAPTION))

    assert outcome.outcome == "incomplete"
    assert audio.calls == []
    assert any(e.event == "audio_unavailable_for_missing_half" for e in outcome.trace)


@pytest.mark.asyncio
async def test_unsupported_language_linked_page_does_not_block_audio_fill() -> None:
    from api.services.extraction_v2.sources import LinkedPage

    class Detector:
        def detect(self, text: str):
            from api.services.extraction_v2.contracts import LanguageResult
            if "PAGE_RU" in text:
                return LanguageResult(code="ru", confidence=0.99)
            return LanguageResult(code="pt", confidence=0.99)

    url = "https://example.com/receita"
    pages = FakePages({url: LinkedPage(url, url, "<main>PAGE_RU</main>")})
    audio = FakeAudioExtractor(ExtractedRecipe(components=[RecipeComponentEvidence(steps=[_step("Bata tudo.")])]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(
        FakeExtractor(text_result=_caption_recipe()), Detector(), pages, audio_evidence_extractor=audio,
    ))

    outcome = await orchestrator.extract(_social_payload(
        CAPTION + f"\n{url}", audio={"status": "transcribed", "transcript": TRANSCRIPT},
    ))

    assert outcome.outcome == "complete"
    assert pages.calls == [url]
    assert len(audio.calls) == 1
    assert any(e.event == "linked_page_skipped" and e.detail == "unsupported_language" for e in outcome.trace)


@pytest.mark.asyncio
async def test_undetermined_transcript_language_still_fills_steps_when_caption_is_supported() -> None:
    from api.services.extraction_v2.contracts import LanguageResult

    class Detector:
        def detect(self, text: str):
            if "TRANSCRIPT_SHORT" in text:
                return LanguageResult(confidence=0.2)
            return LanguageResult(code="pt", confidence=0.99)

    audio = FakeAudioExtractor(ExtractedRecipe(components=[RecipeComponentEvidence(steps=[_step("Bata tudo.")])]))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(
        FakeExtractor(text_result=_caption_recipe()), Detector(), audio_evidence_extractor=audio,
    ))

    outcome = await orchestrator.extract(_social_payload(
        CAPTION, audio={"status": "transcribed", "transcript": "TRANSCRIPT_SHORT bata tudo"},
    ))

    assert outcome.outcome == "complete"
    assert len(audio.calls) == 1
