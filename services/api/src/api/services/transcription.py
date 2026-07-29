from __future__ import annotations

import asyncio
import logging
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import httpx

from api.services import gemini

log = logging.getLogger(__name__)

_MAX_VIDEO_BYTES = 100 * 1024 * 1024
_MAX_AUDIO_BYTES = 20 * 1024 * 1024
_MAX_AUDIO_SECONDS = 10 * 60
_FFMPEG_TIMEOUT_SECONDS = 90


def _is_http_url(url: str) -> bool:
    return urlparse(url).scheme in {"http", "https"}


async def _download_video(url: str, destination: Path) -> None:
    if not _is_http_url(url):
        raise ValueError("video URL must use HTTP or HTTPS")

    timeout = httpx.Timeout(connect=10, read=60, write=10, pool=10)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            content_length = response.headers.get("content-length")
            if content_length and int(content_length) > _MAX_VIDEO_BYTES:
                raise ValueError("video exceeds download size limit")

            downloaded = 0
            with destination.open("wb") as video_file:
                async for chunk in response.aiter_bytes():
                    downloaded += len(chunk)
                    if downloaded > _MAX_VIDEO_BYTES:
                        raise ValueError("video exceeds download size limit")
                    video_file.write(chunk)


async def _extract_mp3(video_path: Path, audio_path: Path) -> None:
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-t",
        str(_MAX_AUDIO_SECONDS),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "48k",
        str(audio_path),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(process.communicate(), timeout=_FFMPEG_TIMEOUT_SECONDS)
    except TimeoutError:
        process.kill()
        await process.communicate()
        raise RuntimeError("audio extraction timed out") from None

    if process.returncode != 0:
        details = stderr.decode(errors="replace").strip()
        raise RuntimeError(f"audio extraction failed: {details[-500:]}")
    if not audio_path.is_file() or audio_path.stat().st_size == 0:
        raise RuntimeError("audio extraction produced no audio")
    if audio_path.stat().st_size > _MAX_AUDIO_BYTES:
        raise ValueError("audio exceeds Gemini inline upload limit")


async def transcribe_video(
    video_url: str,
    model: str = "gemini-2.5-flash-lite",
    usage: gemini.UsageTracker | None = None,
) -> str:
    """Downloads a scraper-supplied video URL and transcribes its spoken audio."""
    log.debug("Starting video transcription: url=%s", video_url)
    with tempfile.TemporaryDirectory(prefix="carrot-transcription-") as directory:
        video_path = Path(directory) / "video"
        audio_path = Path(directory) / "audio.mp3"
        await _download_video(video_url, video_path)
        log.debug("Downloaded video for transcription: bytes=%d", video_path.stat().st_size)
        await _extract_mp3(video_path, audio_path)
        audio_data = audio_path.read_bytes()
        log.debug("Extracted audio for transcription: bytes=%d", len(audio_data))
        transcript = await gemini.transcribe_audio(audio_data, model=model, usage=usage)
        log.debug("Transcription result for %s:\n%s", video_url, transcript)
        return transcript
