"""Production acquisition and dependency assembly for extraction v2."""

from __future__ import annotations

from urllib.parse import urljoin, urlsplit
from urllib.parse import urlunsplit

import httpx
from bs4 import BeautifulSoup

from api.models import ImportMetadata
from api.services import gemini
from api.services.extraction_v2.adapters import GeminiAudioEvidenceExtractor
from api.services.extraction_v2.contracts import (
    Capture, Comment, ExtractionOutcome, FailureReason, FailedOutcome,
    ExtractionStage, HtmlPayload, ImageTextPayload, SocialPayload, TextPayload, TraceEvent,
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
    BROWSER_HEADERS, GeminiTranscriptionProvider, HttpLinkedPageProvider,
    is_safe_public_destination,
)
from api.services.scraper import scraper
from api.services.html_renderer import RendererFailure, render_url

_MAX_HTML_BYTES = 2 * 1024 * 1024
_MAX_REDIRECTS = 5
_SOCIAL_SUFFIXES = ("instagram.com", "tiktok.com")
_UNSUPPORTED_SOCIAL_SUFFIXES = (
    "facebook.com", "fb.watch", "youtube.com", "youtu.be", "pinterest.com",
    "x.com", "twitter.com", "snapchat.com",
)


def _host_matches(host: str, suffixes: tuple[str, ...]) -> bool:
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in suffixes)


def is_html_source(url: str) -> bool:
    host = (urlsplit(url).hostname or "").casefold().rstrip(".")
    return not _host_matches(host, _SOCIAL_SUFFIXES + _UNSUPPORTED_SOCIAL_SUFFIXES)


def _safe_source_url(url: str) -> str:
    parsed = urlsplit(url)
    return urlunsplit((parsed.scheme, parsed.hostname or "", "", "", ""))


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
        headers=BROWSER_HEADERS,
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


def _og_image(html: str, base_url: str) -> str | None:
    tag = BeautifulSoup(html, "html.parser").find("meta", attrs={"property": "og:image"})
    content = str(tag.get("content") or "").strip() if tag else ""
    url = urljoin(base_url, content) if content else None
    return url if url and urlsplit(url).scheme in ("http", "https") else None


async def acquire_and_extract_url(url: str, usage: gemini.UsageTracker) -> tuple[ExtractionOutcome, ImportMetadata, dict]:
    if not await is_safe_public_destination(url):
        return _failure(url, FailureReason.INVALID_INPUT, ExtractionStage.INPUT), ImportMetadata(source_url=url), {}
    host = (urlsplit(url).hostname or "").casefold().rstrip(".")
    if _host_matches(host, _SOCIAL_SUFFIXES):
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
    if _host_matches(host, _UNSUPPORTED_SOCIAL_SUFFIXES):
        return _failure(url, FailureReason.UNSUPPORTED_SOURCE, ExtractionStage.INPUT), ImportMetadata(source_url=url), {}
    render_status = "rendered"
    renderer_failure = None
    try:
        try:
            rendered = await render_url(url)
            html, final_url = rendered.html, rendered.final_url
        except RendererFailure as error:
            if not error.operational:
                raise
            renderer_failure = error.category
            render_status = "raw_fallback"
            html, final_url = await _fetch_html(url)
    except Exception:
        return _failure(url, FailureReason.SOURCE_FETCH_FAILED, ExtractionStage.INPUT), ImportMetadata(source_url=url), {}
    return await _extract_html(
        url, final_url, html, usage, render_status=render_status, renderer_failure=renderer_failure,
    )


async def extract_captured_html(
    url: str, final_url: str, html: str, usage: gemini.UsageTracker,
) -> tuple[ExtractionOutcome, ImportMetadata, dict]:
    return await _extract_html(url, final_url, html, usage, render_status="device_capture")


async def _extract_html(
    url: str, final_url: str, html: str, usage: gemini.UsageTracker,
    *, render_status: str, renderer_failure: str | None = None,
) -> tuple[ExtractionOutcome, ImportMetadata, dict]:
    payload = HtmlPayload(
        schema_version=1, kind="html", source_url=final_url,
        capture=Capture(status="complete"), html=html,
    )
    outcome = await create_production_orchestrator(usage).extract(payload.model_dump(mode="json"))
    outcome.trace.append(TraceEvent(
        stage=ExtractionStage.INPUT, event=f"html_{render_status}", detail=renderer_failure,
    ))
    source_capture = {"schema_version": 1, "kind": "html", "requested_url": _safe_source_url(url), "final_url": _safe_source_url(final_url),
                      "render_status": render_status, "renderer_failure": renderer_failure, "html": html}
    return outcome, ImportMetadata(source_url=final_url, thumbnail_url=_og_image(html, final_url)), source_capture


async def extract_pasted_text(text: str, usage: gemini.UsageTracker) -> ExtractionOutcome:
    payload = TextPayload(schema_version=1, kind="text", text=text[:20000])
    return await create_production_orchestrator(usage).extract(payload.model_dump(mode="json"))


async def extract_image_transcript(text: str, usage: gemini.UsageTracker) -> ExtractionOutcome:
    payload = ImageTextPayload(schema_version=1, kind="image_text", text=text)
    return await create_production_orchestrator(usage).extract(payload.model_dump(mode="json"))
