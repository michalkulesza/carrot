"""Production acquisition and dependency assembly for extraction v2."""

from __future__ import annotations

from urllib.parse import urljoin, urlsplit

import httpx

from api.models import ImportMetadata
from api.services import gemini
from api.services.extraction_v2.adapters import GeminiAudioEvidenceExtractor
from api.services.extraction_v2.contracts import (
    Capture, Comment, ExtractionOutcome, FailureReason, FailedOutcome,
    ExtractionStage, HtmlPayload, SocialPayload, TextPayload,
)
from api.services.extraction_v2.extractor import RecipeEvidenceExtractor
from api.services.extraction_v2.gemini_selection import (
    GeminiTextSelectionProvider, HybridTextExtractor,
)
from api.services.extraction_v2.language import LinguaLanguageDetector
from api.services.extraction_v2.orchestrator import (
    ExtractionDependencies, ExtractionOrchestrator,
)
from api.services.extraction_v2.sources import (
    GeminiTranscriptionProvider, HttpLinkedPageProvider,
    is_safe_public_destination,
)
from api.services.scraper import scraper

_MAX_HTML_BYTES = 2 * 1024 * 1024
_MAX_REDIRECTS = 5
_SOCIAL_SUFFIXES = ("instagram.com", "tiktok.com")
_UNSUPPORTED_SOCIAL_SUFFIXES = (
    "facebook.com", "fb.watch", "youtube.com", "youtu.be", "pinterest.com",
    "x.com", "twitter.com", "snapchat.com",
)


def create_production_orchestrator(usage: gemini.UsageTracker) -> ExtractionOrchestrator:
    extractor = HybridTextExtractor(
        RecipeEvidenceExtractor(),
        GeminiTextSelectionProvider(usage=usage, timeout_seconds=20),
    )
    return ExtractionOrchestrator(ExtractionDependencies(
        extractor=extractor,
        language_detector=LinguaLanguageDetector(),
        linked_page_provider=HttpLinkedPageProvider(),
        transcription_provider=GeminiTranscriptionProvider(),
        audio_evidence_extractor=GeminiAudioEvidenceExtractor(usage=usage),
    ))


async def _fetch_html(url: str) -> tuple[str, str]:
    current = url
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(20, connect=8), follow_redirects=False,
        headers={"User-Agent": "Mozilla/5.0 CarrotRecipeImporter/2.0"},
    ) as client:
        for _ in range(_MAX_REDIRECTS + 1):
            if not await is_safe_public_destination(current):
                raise ValueError("URL does not resolve to a public HTTP destination")
            async with client.stream("GET", current) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise ValueError("redirect did not provide a destination")
                    current = urljoin(current, location)
                    continue
                response.raise_for_status()
                content_type = response.headers.get("content-type", "").casefold()
                if content_type and "html" not in content_type:
                    raise ValueError("URL response is not HTML")
                length = response.headers.get("content-length")
                if length and int(length) > _MAX_HTML_BYTES:
                    raise ValueError("HTML response exceeds size limit")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > _MAX_HTML_BYTES:
                        raise ValueError("HTML response exceeds size limit")
                return bytes(body).decode(response.encoding or "utf-8", errors="replace"), str(response.url)
    raise ValueError("URL exceeded redirect limit")


def _failure(url: str, reason: FailureReason, stage: ExtractionStage) -> FailedOutcome:
    return FailedOutcome(outcome="failed", source_url=url, evidence=[], trace=[], reason=reason, failed_stage=stage)


async def acquire_and_extract_url(url: str, usage: gemini.UsageTracker) -> tuple[ExtractionOutcome, ImportMetadata, dict]:
    if not await is_safe_public_destination(url):
        return _failure(url, FailureReason.INVALID_INPUT, ExtractionStage.INPUT), ImportMetadata(source_url=url), {}
    host = (urlsplit(url).hostname or "").casefold().rstrip(".")
    is_social = any(host == suffix or host.endswith(f".{suffix}") for suffix in _SOCIAL_SUFFIXES)
    if is_social:
        try:
            metadata = await scraper.fetch_reel(url)
        except Exception:
            return _failure(url, FailureReason.SOURCE_FETCH_FAILED, ExtractionStage.INPUT), ImportMetadata(source_url=url), {}
        safe_video = metadata.video_url if metadata.video_url and await is_safe_public_destination(metadata.video_url) else None
        comments = [Comment.model_validate(comment) for comment in metadata.comments[:100]]
        capture_errors = []
        if not metadata.description.strip():
            capture_errors.append("caption_unavailable")
        if safe_video is None:
            capture_errors.append("media_url_unavailable")
        envelope = SocialPayload(
            schema_version=1, kind="social", source_url=metadata.canonical_url,
            capture=Capture(status="partial" if capture_errors else "complete", errors=capture_errors),
            scrapecreators_response=metadata.raw_response, comments=comments,
            audio={"video_url": safe_video, "status": "available" if safe_video else "unavailable"},
        ).model_dump(mode="json")
        outcome = await create_production_orchestrator(usage).extract(envelope)
        source_capture = {
            "schema_version": 1, "kind": "social", "raw_response": metadata.raw_response,
            "capture": envelope["capture"],
        }
        return outcome, ImportMetadata(
            source_url=metadata.canonical_url, thumbnail_url=metadata.thumbnail_url,
            creator_handle=metadata.creator_handle,
        ), source_capture
    if any(host == suffix or host.endswith(f".{suffix}") for suffix in _UNSUPPORTED_SOCIAL_SUFFIXES):
        return _failure(url, FailureReason.UNSUPPORTED_SOURCE, ExtractionStage.INPUT), ImportMetadata(source_url=url), {}
    try:
        html, final_url = await _fetch_html(url)
    except Exception:
        return _failure(url, FailureReason.SOURCE_FETCH_FAILED, ExtractionStage.INPUT), ImportMetadata(source_url=url), {}
    payload = HtmlPayload(
        schema_version=1, kind="html", source_url=final_url,
        capture=Capture(status="complete"), html=html,
    )
    outcome = await create_production_orchestrator(usage).extract(payload.model_dump(mode="json"))
    source_capture = {"schema_version": 1, "kind": "html", "final_url": final_url, "html": html}
    return outcome, ImportMetadata(source_url=final_url), source_capture


async def extract_pasted_text(text: str, usage: gemini.UsageTracker) -> ExtractionOutcome:
    payload = TextPayload(schema_version=1, kind="text", text=text[:20000])
    return await create_production_orchestrator(usage).extract(payload.model_dump(mode="json"))
