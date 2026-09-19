"""Versioned source-payload builders for the Instagram fixture capture tool."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

INSTAGRAM_PATH_PREFIXES = ("/p/", "/reel/", "/tv/")
FIXTURE_SCHEMA_VERSION = 1


def is_instagram_post_url(url: str) -> bool:
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()

    return (
        parsed.scheme in {"http", "https"}
        and (hostname == "instagram.com" or hostname.endswith(".instagram.com"))
        and parsed.path.startswith(INSTAGRAM_PATH_PREFIXES)
    )


def is_http_url(url: str) -> bool:
    return urlparse(url).scheme in {"http", "https"}


def build_scrapecreators_response(
    description: str,
    creator_handle: str | None,
    thumbnail_url: str | None,
    video_url: str | None,
) -> dict[str, Any]:
    media: dict[str, Any] = {
        "edge_media_to_caption": {"edges": [{"node": {"text": description}}] if description else []},
        "owner": {"username": creator_handle} if creator_handle else {},
    }
    if thumbnail_url:
        media["thumbnail_src"] = thumbnail_url
    if video_url:
        media["video_url"] = video_url

    return {"data": {"xdt_shortcode_media": media}}


def build_fixture(
    source_url: str,
    description: str,
    creator_handle: str | None,
    thumbnail_url: str | None,
    video_url: str | None,
    comments: list[dict[str, Any]],
    audio_title: str | None,
    transcript: str | None,
    transcription_error: str | None,
    errors: list[str],
) -> dict[str, Any]:
    status = "failed" if not creator_handle and errors else "partial" if errors else "complete"

    return {
        "schema_version": FIXTURE_SCHEMA_VERSION,
        "kind": "social",
        "captured_at": datetime.now(UTC).isoformat(),
        "source_url": source_url,
        "capture": {"status": status, "errors": errors},
        "scrapecreators_response": build_scrapecreators_response(
            description, creator_handle, thumbnail_url, video_url,
        ),
        "comments": comments,
        "audio": {
            "video_url": video_url,
            "audio_url": None,
            "audio_title": audio_title,
            "transcript": transcript,
            "status": (
                "transcribed" if transcript
                else "transcription_failed" if transcription_error
                else "video_available" if video_url
                else "unavailable"
            ),
            "transcription_error": transcription_error,
        },
    }


def build_html_fixture(source_url: str, html: str, errors: list[str]) -> dict[str, Any]:
    return {
        "schema_version": FIXTURE_SCHEMA_VERSION,
        "kind": "html",
        "captured_at": datetime.now(UTC).isoformat(),
        "source_url": source_url,
        "capture": {
            "status": "partial" if errors else "complete",
            "errors": errors,
        },
        "html": html,
    }
