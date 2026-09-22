"""Source-aware sequencing for extraction v2; no legacy import paths call this yet."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin

from pydantic import ValidationError

from api.services.extraction_v2.contracts import (
    AudioEvidenceExtractor, AudioExtractionInput, CompleteOutcome, EvidenceKind,
    EvidenceSource, ExtractedRecipe, ExtractionInput, ExtractionOutcome,
    ExtractionStage, ExtractorV2, FailedOutcome, FailureReason, HtmlPayload,
    IncompleteOutcome, IssueCode, LanguageDetector, LanguageResult, SocialPayload,
    SOURCE_PAYLOAD_ADAPTER, TraceEvent,
    validate_extracted_recipe,
)
from api.services.extraction_v2.language import SUPPORTED_LANGUAGE_CODES
from api.services.extraction_v2.merge import has_ingredients, has_instructions, merge_recipes, recipes_can_merge
from api.services.extraction_v2.sources import (
    LinkedPageProvider, TranscriptionProvider, is_safe_http_url, normalize_segments,
    parse_social_metadata, text_segments, unique_safe_links, verified_creator_comments,
)
from api.services.html_cleaner import clean_html_body

MAX_LINKED_PAGES = 3


@dataclass(frozen=True)
class ExtractionDependencies:
    extractor: ExtractorV2
    language_detector: LanguageDetector
    linked_page_provider: LinkedPageProvider | None = None
    transcription_provider: TranscriptionProvider | None = None
    audio_evidence_extractor: AudioEvidenceExtractor | None = None


class ExtractionOrchestrator:
    def __init__(self, dependencies: ExtractionDependencies) -> None:
        self._dependencies = dependencies

    async def extract(self, raw_payload: dict[str, Any]) -> ExtractionOutcome:
        try:
            payload = SOURCE_PAYLOAD_ADAPTER.validate_python(raw_payload)
        except ValidationError:
            return FailedOutcome(
                outcome="failed", source_url=str(raw_payload.get("source_url", "")) if isinstance(raw_payload, dict) else "", evidence=[], trace=[],
                reason=FailureReason.INVALID_INPUT, failed_stage=ExtractionStage.INPUT,
            )
        if isinstance(payload, HtmlPayload):
            return await self._extract_html_payload(payload)
        return await self._extract_social_payload(payload)

    def _language_failure(
        self, result: LanguageResult, source_url: str, evidence: list[EvidenceSource], trace: list[TraceEvent], evidence_id: str,
    ) -> FailedOutcome | None:
        if result.code and result.code not in SUPPORTED_LANGUAGE_CODES:
            trace.append(TraceEvent(stage=ExtractionStage.LANGUAGE, event="unsupported_language", evidence_ids=[evidence_id]))
            return FailedOutcome(outcome="failed", source_url=source_url, evidence=evidence, trace=trace,
                                 reason=FailureReason.UNSUPPORTED_LANGUAGE, failed_stage=ExtractionStage.LANGUAGE)
        if result.code is None and result.confidence is not None:
            trace.append(TraceEvent(stage=ExtractionStage.LANGUAGE, event="undetermined_language", evidence_ids=[evidence_id]))
            return FailedOutcome(outcome="failed", source_url=source_url, evidence=evidence, trace=trace,
                                 reason=FailureReason.LANGUAGE_UNDETERMINED, failed_stage=ExtractionStage.LANGUAGE)
        return None

    def _classify(self, source_url: str, recipe: ExtractedRecipe, evidence: list[EvidenceSource], trace: list[TraceEvent]) -> ExtractionOutcome:
        ingredients, instructions = has_ingredients(recipe), has_instructions(recipe)
        if ingredients and instructions:
            trace.append(TraceEvent(stage=ExtractionStage.COMPLETE, event="complete"))
            return CompleteOutcome(outcome="complete", source_url=source_url, recipe=recipe, evidence=evidence, trace=trace)
        if ingredients or instructions:
            issue = IssueCode.MISSING_INSTRUCTIONS if ingredients else IssueCode.MISSING_INGREDIENTS
            return IncompleteOutcome(outcome="incomplete", source_url=source_url, recipe=recipe, evidence=evidence, trace=trace, issue_codes=[issue])
        return FailedOutcome(outcome="failed", source_url=source_url, evidence=evidence, trace=trace,
                             reason=recipe.failure_reason or FailureReason.NO_RECIPE_CONTENT, failed_stage=ExtractionStage.TEXT)

    @staticmethod
    def _resolve_links(recipe: ExtractedRecipe, base_url: str) -> ExtractedRecipe:
        """Expose only policy-approved absolute component links to callers."""

        resolved = recipe.model_copy(deep=True)
        for component in resolved.components:
            for ingredient in component.ingredients:
                safe_links = []
                for link in ingredient.links:
                    destination = urljoin(base_url, link.url)
                    if is_safe_http_url(destination):
                        safe_links.append(link.model_copy(update={"url": destination}))
                ingredient.links = safe_links
                ingredient.link_url = safe_links[0].url if safe_links else None
        return resolved

    async def _extract_html_payload(self, payload: HtmlPayload) -> ExtractionOutcome:
        cleaned = clean_html_body(payload.html)
        language = self._dependencies.language_detector.detect(cleaned)
        source = EvidenceSource(id="html:0", kind=EvidenceKind.HTML, source_url=str(payload.source_url), text=cleaned, language=language)
        evidence, trace = [source], [TraceEvent(stage=ExtractionStage.INPUT, event="html_received", evidence_ids=[source.id])]
        failure = self._language_failure(language, str(payload.source_url), evidence, trace, source.id)
        if failure:
            return failure
        try:
            recipe = self._resolve_links(validate_extracted_recipe(
                await self._dependencies.extractor.extract_html(ExtractionInput(content=cleaned, evidence_ids=[source.id])), {source.id},
            ), str(payload.source_url))
        except TimeoutError:
            return FailedOutcome(outcome="failed", source_url=str(payload.source_url), evidence=evidence, trace=trace,
                                 reason=FailureReason.MODEL_TIMEOUT, failed_stage=ExtractionStage.TEXT)
        except Exception:
            return FailedOutcome(outcome="failed", source_url=str(payload.source_url), evidence=evidence, trace=trace,
                                 reason=FailureReason.INVALID_MODEL_RESPONSE, failed_stage=ExtractionStage.TEXT)
        trace.append(TraceEvent(stage=ExtractionStage.TEXT, event="html_extracted", evidence_ids=[source.id]))
        return self._classify(str(payload.source_url), recipe, evidence, trace)

    async def _extract_social_payload(self, payload: SocialPayload) -> ExtractionOutcome:
        source_url, trace, evidence = str(payload.source_url), [], []
        last_operational_failure: tuple[FailureReason, ExtractionStage] | None = None
        metadata = parse_social_metadata(payload.scrapecreators_response, source_url)
        verified, excluded = verified_creator_comments(payload.comments, metadata.creator_handle)
        trace.extend(TraceEvent(stage=ExtractionStage.INPUT, event="comment_excluded", detail=item) for item in excluded)
        segments = text_segments(metadata, verified)
        for segment in segments:
            language = self._dependencies.language_detector.detect(segment.text)
            source = EvidenceSource(id=segment.id, kind=segment.kind, source_url=segment.source_url, text=segment.text,
                                    language=language, author_verified=segment.author_verified)
            evidence.append(source)
            failure = self._language_failure(language, source_url, evidence, trace, segment.id)
            if failure:
                return failure
        normalized = normalize_segments(segments)
        text, evidence_ids = normalized.content, normalized.evidence_ids
        evidence = [
            item.model_copy(update={"locator": f"normalized:{normalized.spans[item.id][0]}-{normalized.spans[item.id][1]}"})
            if item.id in normalized.spans else item
            for item in evidence
        ]
        recipe = ExtractedRecipe()
        if text:
            try:
                recipe = validate_extracted_recipe(await self._dependencies.extractor.extract_text(
                    ExtractionInput(
                        content=text,
                        evidence_ids=evidence_ids,
                        spans=[{"evidence_id": evidence_id, "start": start, "end": end}
                               for evidence_id, (start, end) in normalized.spans.items()],
                    ),
                ), set(evidence_ids))
            except TimeoutError:
                last_operational_failure = (FailureReason.MODEL_TIMEOUT, ExtractionStage.TEXT)
                trace.append(TraceEvent(stage=ExtractionStage.TEXT, event="extract_timeout", evidence_ids=evidence_ids))
            except Exception:
                last_operational_failure = (FailureReason.INVALID_MODEL_RESPONSE, ExtractionStage.TEXT)
                trace.append(TraceEvent(stage=ExtractionStage.TEXT, event="invalid_model_response", evidence_ids=evidence_ids))
            else:
                trace.append(TraceEvent(stage=ExtractionStage.TEXT, event="social_text_extracted", evidence_ids=evidence_ids))
                diagnostic = getattr(self._dependencies.extractor, "last_diagnostic", None)
                if diagnostic:
                    trace.append(TraceEvent(stage=ExtractionStage.TEXT, event=diagnostic, evidence_ids=evidence_ids))
            if has_ingredients(recipe) and has_instructions(recipe):
                return self._classify(source_url, recipe, evidence, trace)

        links, skipped = unique_safe_links(metadata.linked_urls, metadata.canonical_url, MAX_LINKED_PAGES)
        trace.extend(TraceEvent(stage=ExtractionStage.LINKED_PAGE, event="link_skipped", detail=item) for item in skipped)
        if self._dependencies.linked_page_provider:
            for index, link in enumerate(links):
                try:
                    page = await self._dependencies.linked_page_provider.fetch(link)
                except Exception as error:
                    last_operational_failure = (FailureReason.SOURCE_FETCH_FAILED, ExtractionStage.LINKED_PAGE)
                    trace.append(TraceEvent(stage=ExtractionStage.LINKED_PAGE, event="fetch_failed", detail=type(error).__name__))
                    continue
                cleaned = clean_html_body(page.html)
                language = self._dependencies.language_detector.detect(cleaned)
                source = EvidenceSource(id=f"linked_page:{index}", kind=EvidenceKind.LINKED_PAGE, source_url=page.final_url, text=cleaned, language=language)
                evidence.append(source)
                failure = self._language_failure(language, source_url, evidence, trace, source.id)
                if failure:
                    return failure
                try:
                    linked_recipe = self._resolve_links(validate_extracted_recipe(
                        await self._dependencies.extractor.extract_html(ExtractionInput(content=cleaned, evidence_ids=[source.id])), {source.id},
                    ), page.final_url)
                except TimeoutError:
                    last_operational_failure = (FailureReason.MODEL_TIMEOUT, ExtractionStage.LINKED_PAGE)
                    trace.append(TraceEvent(stage=ExtractionStage.LINKED_PAGE, event="extract_timeout", evidence_ids=[source.id]))
                    continue
                except Exception:
                    last_operational_failure = (FailureReason.INVALID_MODEL_RESPONSE, ExtractionStage.LINKED_PAGE)
                    trace.append(TraceEvent(stage=ExtractionStage.LINKED_PAGE, event="invalid_model_response", evidence_ids=[source.id]))
                    continue
                if recipes_can_merge(recipe, linked_recipe):
                    recipe = merge_recipes(recipe, linked_recipe)
                    trace.append(TraceEvent(stage=ExtractionStage.LINKED_PAGE, event="linked_page_merged", evidence_ids=[source.id]))
                else:
                    trace.append(TraceEvent(stage=ExtractionStage.LINKED_PAGE, event="linked_page_skipped", detail="different_recipe", evidence_ids=[source.id]))
                if has_ingredients(recipe) and has_instructions(recipe):
                    return self._classify(source_url, recipe, evidence, trace)

        transcript = payload.audio.transcript
        if not transcript and payload.audio.video_url and self._dependencies.transcription_provider:
            try:
                transcript = await self._dependencies.transcription_provider.transcribe(payload.audio.video_url)
                trace.append(TraceEvent(stage=ExtractionStage.TRANSCRIPT, event="transcribed"))
            except Exception as error:
                last_operational_failure = (FailureReason.TRANSCRIPTION_FAILED, ExtractionStage.TRANSCRIPT)
                trace.append(TraceEvent(stage=ExtractionStage.TRANSCRIPT, event="transcription_failed", detail=type(error).__name__))
        if transcript and self._dependencies.audio_evidence_extractor:
            language = self._dependencies.language_detector.detect(transcript)
            source = EvidenceSource(id="transcript:0", kind=EvidenceKind.TRANSCRIPT, source_url=source_url, text=transcript, language=language)
            evidence.append(source)
            failure = self._language_failure(language, source_url, evidence, trace, source.id)
            if failure:
                return failure
            try:
                audio_recipe = validate_extracted_recipe(await self._dependencies.audio_evidence_extractor.extract_audio(AudioExtractionInput(transcript=transcript, retained_recipe=recipe)), {source.id})
                recipe = merge_recipes(recipe, audio_recipe)
                trace.append(TraceEvent(stage=ExtractionStage.AUDIO_MODEL, event="audio_merged", evidence_ids=[source.id]))
            except TimeoutError:
                last_operational_failure = (FailureReason.MODEL_TIMEOUT, ExtractionStage.AUDIO_MODEL)
                trace.append(TraceEvent(stage=ExtractionStage.AUDIO_MODEL, event="audio_model_timeout"))
            except Exception as error:
                last_operational_failure = (FailureReason.INVALID_MODEL_RESPONSE, ExtractionStage.AUDIO_MODEL)
                trace.append(TraceEvent(stage=ExtractionStage.AUDIO_MODEL, event="audio_model_failed", detail=type(error).__name__))
        outcome = self._classify(source_url, recipe, evidence, trace)
        if outcome.outcome == "failed" and last_operational_failure:
            reason, failed_stage = last_operational_failure
            return FailedOutcome(outcome="failed", source_url=source_url, evidence=evidence, trace=trace,
                                 reason=reason, failed_stage=failed_stage)
        return outcome
