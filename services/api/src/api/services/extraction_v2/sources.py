"""Source adaptation, creator verification, normalization, and URL policy."""

from __future__ import annotations

import ipaddress
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urljoin, urlsplit

import httpx

from api.services.extraction_v2.contracts import Comment, EvidenceKind
from api.services.scraper import ReelMetadata, parse_scrapecreators_reel_response


@dataclass(frozen=True)
class TextSegment:
    id: str
    kind: EvidenceKind
    text: str
    source_url: str
    author_verified: bool | None = None


@dataclass(frozen=True)
class NormalizedText:
    content: str
    evidence_ids: list[str]
    spans: dict[str, tuple[int, int]]


@dataclass(frozen=True)
class LinkedPage:
    requested_url: str
    final_url: str
    html: str


class LinkedPageProvider(Protocol):
    async def fetch(self, url: str) -> LinkedPage: ...


class TranscriptionProvider(Protocol):
    async def transcribe(self, video_url: str) -> str: ...


class HttpLinkedPageProvider:
    """Bounded linked-page fetcher that validates every redirect destination."""

    _MAX_REDIRECTS = 5
    _MAX_RESPONSE_BYTES = 2 * 1024 * 1024

    async def fetch(self, url: str) -> LinkedPage:
        current_url = url
        timeout = httpx.Timeout(connect=10, read=20, write=10, pool=10)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            for _ in range(self._MAX_REDIRECTS + 1):
                if not is_safe_http_url(current_url):
                    raise ValueError("linked page URL is not a safe HTTP(S) destination")
                async with client.stream("GET", current_url) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise ValueError("linked page redirect has no location")
                        current_url = urljoin(current_url, location)
                        continue
                    response.raise_for_status()
                    if "html" not in response.headers.get("content-type", "").casefold():
                        raise ValueError("linked page is not HTML")
                    chunks: list[bytes] = []
                    downloaded = 0
                    async for chunk in response.aiter_bytes():
                        downloaded += len(chunk)
                        if downloaded > self._MAX_RESPONSE_BYTES:
                            raise ValueError("linked page exceeds response size limit")
                        chunks.append(chunk)
                    return LinkedPage(url, str(response.url), b"".join(chunks).decode(response.encoding or "utf-8", errors="replace"))
        raise ValueError("linked page exceeded redirect limit")


class GeminiTranscriptionProvider:
    async def transcribe(self, video_url: str) -> str:
        from api.services.transcription import transcribe_video

        return await transcribe_video(video_url)


def parse_social_metadata(payload: dict, source_url: str) -> ReelMetadata:
    return parse_scrapecreators_reel_response(payload, source_url)


def normalize_handle(handle: str | None) -> str | None:
    if not handle:
        return None

    normalized = handle.strip().removeprefix("@").casefold()
    return normalized or None


def verified_creator_comments(
    comments: Iterable[Comment],
    creator_handle: str | None,
    creator_id: str | None = None,
) -> tuple[list[Comment], list[str]]:
    """Accept only a stable ID match or an exact normalized handle match."""

    verified: list[Comment] = []
    excluded: list[str] = []
    seen: set[tuple[str, ...]] = set()
    normalized_creator_handle = normalize_handle(creator_handle)

    for index, comment in enumerate(comments):
        identity_key = (
            ("id", comment.id)
            if comment.id
            else ("content", comment.author_id or "", normalize_handle(comment.author_handle) or "", comment.text.strip())
        )
        if identity_key in seen:
            excluded.append(f"comment:{index}:duplicate")
            continue
        seen.add(identity_key)

        has_conflicting_ids = bool(creator_id and comment.author_id and creator_id != comment.author_id)
        id_matches = bool(creator_id and comment.author_id and creator_id == comment.author_id)
        handle_matches = bool(
            normalized_creator_handle
            and normalize_handle(comment.author_handle) == normalized_creator_handle
        )
        if has_conflicting_ids or not (id_matches or handle_matches):
            excluded.append(f"comment:{index}:author_not_verified")
            continue
        verified.append(comment)

    return verified, excluded


def text_segments(metadata: ReelMetadata, comments: Iterable[Comment]) -> list[TextSegment]:
    segments: list[TextSegment] = []
    if metadata.description.strip():
        segments.append(TextSegment("caption:0", EvidenceKind.CAPTION, metadata.description, metadata.canonical_url))
    for index, comment in enumerate(comments):
        if comment.text.strip():
            segments.append(TextSegment(
                f"creator_comment:{index}", EvidenceKind.CREATOR_COMMENT, comment.text,
                metadata.canonical_url, author_verified=True,
            ))
    return segments


def normalize_segments(segments: Iterable[TextSegment]) -> NormalizedText:
    normalized: list[str] = []
    evidence_ids: list[str] = []
    spans: dict[str, tuple[int, int]] = {}
    offset = 0
    for segment in segments:
        text = re.sub(r"[\t\r ]+", " ", segment.text).strip()
        text = re.sub(r"\n{3,}", "\n\n", text)
        if text:
            if normalized:
                offset += 2
            spans[segment.id] = (offset, offset + len(text))
            normalized.append(text)
            evidence_ids.append(segment.id)
            offset += len(text)
    return NormalizedText("\n\n".join(normalized), evidence_ids, spans)


def is_safe_http_url(url: str) -> bool:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        return False
    hostname = parsed.hostname.casefold().rstrip(".")
    if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(".local"):
        return False
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return True
    return not (address.is_private or address.is_loopback or address.is_link_local or address.is_reserved)


def unique_safe_links(urls: Iterable[str], base_url: str, limit: int) -> tuple[list[str], list[str]]:
    links: list[str] = []
    skipped: list[str] = []
    seen: set[str] = set()
    for raw_url in urls:
        url = urljoin(base_url, raw_url.rstrip(".,;:!?)"))
        if not is_safe_http_url(url):
            skipped.append(f"link:{raw_url}:unsafe")
            continue
        canonical = urlsplit(url)._replace(fragment="").geturl()
        if canonical in seen:
            skipped.append(f"link:{canonical}:duplicate")
            continue
        seen.add(canonical)
        if len(links) >= limit:
            skipped.append(f"link:{canonical}:limit")
            continue
        links.append(canonical)
    return links, skipped
