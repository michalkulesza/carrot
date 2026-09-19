"""Capture local Instagram fixtures for ExtractorV2 evaluation.

Run with the API virtual environment. Chrome opens visibly and retains its login
only in the local profile directory selected with --profile-dir.
"""

from __future__ import annotations

import asyncio
import argparse
import base64
import json
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from websockets.sync.client import connect

from fixture_payload import (
    build_fixture,
    build_html_fixture,
    is_http_url,
    is_instagram_post_url,
)

API_SOURCE_DIR = Path(__file__).resolve().parents[2] / "services" / "api" / "src"
sys.path.insert(0, str(API_SOURCE_DIR))

from api.services.transcription import transcribe_video
from api.services import gemini

DEFAULT_CHROME_PATH = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
DEFAULT_PROFILE_DIR = Path.home() / "AppData" / "Local" / "Carrot" / "instagram-capture-profile"
DEFAULT_OUTPUT_DIR = Path("instagram-fixtures")
FAILED_URLS_FILENAME = "failed-urls.json"
PAGE_LOAD_TIMEOUT_SECONDS = 45
PAGE_LOAD_POLL_SECONDS = 1
BLOB_DOWNLOAD_CHUNK_BYTES = 1024 * 1024
MAX_VIDEO_BYTES = 100 * 1024 * 1024
MAX_AUDIO_BYTES = 20 * 1024 * 1024
FULL_REEL_WAIT_SECONDS = 30


class CdpPage:
    def __init__(self, websocket_url: str) -> None:
        self._socket = connect(websocket_url, origin="http://localhost")
        self._next_id = 1
        self._events: list[dict[str, Any]] = []

    def close(self) -> None:
        self._socket.close()

    def _request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        request_id = self._next_id
        self._next_id += 1
        self._socket.send(json.dumps({
            "id": request_id,
            "method": method,
            "params": params,
        }))

        while True:
            response = json.loads(self._socket.recv())
            if response.get("id") != request_id:
                self._events.append(response)
                continue
            if "error" in response:
                raise RuntimeError(response["error"].get("message", "Chrome evaluation failed"))

            return response["result"]

    def enable_network_tracking(self) -> None:
        self._request("Network.enable", {})

    def navigate(self, url: str) -> None:
        self._request("Page.navigate", {"url": url})

    def media_urls(self) -> list[str]:
        urls: list[str] = []
        for event in self._events:
            if event.get("method") != "Network.requestWillBeSent":
                continue
            params = event.get("params") or {}
            request = params.get("request") or {}
            url = request.get("url")
            is_instagram_media_url = (
                isinstance(url, str)
                and "cdninstagram.com" in url
                and ("/o1/" in url or ".mp4" in url)
            )
            if (params.get("type") == "Media" or is_instagram_media_url) and isinstance(url, str) and url.startswith("http"):
                urls.append(url)

        return list(dict.fromkeys(urls))

    def evaluate(self, expression: str, *, await_promise: bool = False) -> Any:
        response = self._request("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": await_promise,
        })

        result = response.get("result", {})
        exception_details = response.get("exceptionDetails")
        if exception_details:
            exception = exception_details.get("exception") or {}
            raise RuntimeError(
                exception.get("description")
                or exception_details.get("text")
                or "Page script failed"
            )
        return result.get("value")


def _read_source_urls(args: argparse.Namespace) -> tuple[list[str], list[str]]:
    urls = list(args.urls)
    if args.input_file:
        urls.extend(args.input_file.read_text(encoding="utf-8").splitlines())

    unique_urls = list(dict.fromkeys(url.strip() for url in urls if url.strip()))
    invalid_urls = [url for url in unique_urls if not is_http_url(url)]
    if invalid_urls:
        raise ValueError(f"Not HTTP or HTTPS URLs: {', '.join(invalid_urls)}")

    return (
        [url for url in unique_urls if is_instagram_post_url(url)],
        [url for url in unique_urls if not is_instagram_post_url(url)],
    )


def _read_html_urls(args: argparse.Namespace) -> list[str]:
    urls = list(dict.fromkeys(url.strip() for url in args.html_urls if url.strip()))
    invalid_urls = [url for url in urls if not is_http_url(url)]
    if invalid_urls:
        raise ValueError(f"Not HTTP or HTTPS URLs: {', '.join(invalid_urls)}")

    return urls


def _read_json_urls(input_json: Path | None) -> tuple[list[str], list[str]]:
    if not input_json:
        return [], []

    raw_json = input_json.read_text(encoding="utf-8")
    data = json.loads(re.sub(r",(\s*[}\]])", r"\1", raw_json))
    if isinstance(data, dict):
        data = data.get("urls", data.get("source_urls"))
    if not isinstance(data, list) or any(not isinstance(url, str) for url in data):
        raise ValueError("--input-json must contain a JSON array of URL strings or a urls/source_urls array.")

    urls = list(dict.fromkeys(url.strip() for url in data if url.strip()))
    invalid_urls = [url for url in urls if not is_http_url(url)]
    if invalid_urls:
        raise ValueError(f"Not HTTP or HTTPS URLs: {', '.join(invalid_urls)}")

    return (
        [url for url in urls if is_instagram_post_url(url)],
        [url for url in urls if not is_instagram_post_url(url)],
    )


def _start_chrome(chrome_path: Path, profile_dir: Path, port: int) -> subprocess.Popen[bytes]:
    if not chrome_path.is_file():
        raise FileNotFoundError(f"Chrome was not found at {chrome_path}")
    profile_dir.mkdir(parents=True, exist_ok=True)

    return subprocess.Popen([
        str(chrome_path),
        f"--remote-debugging-port={port}",
        "--remote-allow-origins=http://localhost",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "https://www.instagram.com/accounts/login/",
    ])


def _new_page(port: int, url: str) -> CdpPage:
    endpoint = f"http://127.0.0.1:{port}/json/new?about:blank"
    request = urllib.request.Request(endpoint, method="PUT")
    with urllib.request.urlopen(request, timeout=10) as response:
        page = json.load(response)

    cdp_page = CdpPage(page["webSocketDebuggerUrl"])
    cdp_page.enable_network_tracking()
    cdp_page.navigate(url)

    return cdp_page


def _expand_comments(page: CdpPage, limit: int) -> None:
    page.evaluate(f"""
        (async () => {{
          const limit = {limit};
          for (let pass = 0; pass < limit; pass += 1) {{
            const controls = [...document.querySelectorAll('button, span[role="button"]')]
              .filter((node) => /view (all|more).*comments|more comments/i.test(node.innerText));
            if (!controls.length) return;
            controls.forEach((node) => node.click());
            await new Promise((resolve) => setTimeout(resolve, 500));
          }}
        }})()
    """, await_promise=True)


def _wait_for_post(page: CdpPage, source_url: str, timeout_seconds: int) -> bool:
    expected_path = urlparse(source_url).path.rstrip("/")
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        is_ready = page.evaluate(f"""
            (() => {{
              const article = document.querySelector('article');
                return Boolean(document.querySelector('video'));
            }})()
        """)
        if is_ready:
            return True
        time.sleep(PAGE_LOAD_POLL_SECONDS)

    return False


def _capture_visible_data(page: CdpPage) -> dict[str, Any]:
    return page.evaluate("""
        (() => {
          const article = document.querySelector('article') || document.body;
          const meta = (property) => document.querySelector(`meta[property="${property}"]`)?.content || null;
          const ogDescription = meta('og:description');
          const ogTitle = meta('og:title');
          const ownerLink = article.querySelector('header a[href^="/"]') || article.querySelector('a[href^="/"]');
          const creatorFromTitle = ogTitle?.match(/^([^()]+?)\\s*(?:\\([^)]*\\)\\s*)?on Instagram/i)?.[1]?.trim() || null;
          const creatorFromDescription = ogDescription?.match(/-\\s*([a-z0-9._]+)\\s+on\\s+/i)?.[1] || null;
          const creatorHandle = creatorFromDescription || ownerLink?.getAttribute('href')?.split('/').filter(Boolean)[0] || creatorFromTitle;
          const caption = article.querySelector('h1')?.innerText?.trim() || ogDescription || '';
          const visibleComments = [...article.querySelectorAll('ul li')]
            .map((item) => {
              const authorLink = item.querySelector('a[href^="/"]');
              const authorHandle = authorLink?.getAttribute('href')?.split('/').filter(Boolean)[0] || null;
              const rawText = item.innerText?.trim() || '';
              const text = authorHandle && rawText.startsWith(authorHandle)
                ? rawText.slice(authorHandle.length).trim()
                : rawText;
              return {
                id: item.getAttribute('data-comment-id'),
                parent_comment_id: null,
                author_handle: authorHandle,
                text,
                is_creator_authored: Boolean(creatorHandle && authorHandle && creatorHandle.toLowerCase() === authorHandle.toLowerCase()),
                authorship_evidence: creatorHandle && authorHandle && creatorHandle.toLowerCase() === authorHandle.toLowerCase()
                  ? 'author handle matches post owner'
                  : 'author handle does not match post owner or is unavailable',
              };
            })
            .filter((comment) => comment.author_handle && comment.text);
          const video = article.querySelector('video') || document.querySelector('video');
          const mediaRequest = performance.getEntriesByType('resource')
            .filter((entry) => entry.name.startsWith('http'))
            .filter((entry) => entry.initiatorType === 'video' || /\\/o1\\/v\\/|\\.mp4(?:[?#]|$)/i.test(entry.name))
            .sort((left, right) => right.transferSize - left.transferSize)[0]?.name || null;
          const audioLink = [...article.querySelectorAll('a[href*="/audio/"]')][0];
          return {
            description: caption,
            creator_handle: creatorHandle,
            thumbnail_url: meta('og:image'),
            video_url: mediaRequest || video?.currentSrc || video?.src || meta('og:video'),
            audio_title: audioLink?.innerText?.trim() || null,
            comments: visibleComments,
            visible_comment_count: visibleComments.length,
          };
        })()
    """)


def _output_path(output_dir: Path, source_url: str) -> Path:
    shortcode = urlparse(source_url).path.strip('/').split('/')[-1]
    return output_dir / f"instagram-{shortcode}.json"


def _html_output_path(output_dir: Path, source_url: str) -> Path:
    parsed = urlparse(source_url)
    slug = "-".join(part for part in parsed.path.strip("/").split("/") if part) or "index"
    safe_slug = "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in slug)
    hostname = (parsed.hostname or "source").replace(".", "-")

    return output_dir / f"html-{hostname}-{safe_slug[:80]}.json"


def _write_failed_urls(output_dir: Path, failed_urls: list[dict[str, Any]]) -> None:
    output_path = output_dir / FAILED_URLS_FILENAME
    temporary_path = output_path.with_suffix(".json.tmp")
    temporary_path.write_text(json.dumps(failed_urls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(output_path)


def _download_browser_blob(page: CdpPage, blob_url: str, destination: Path) -> None:
    metadata = page.evaluate(f"""
        (async () => {{
          const response = await fetch({json.dumps(blob_url)});
          const blob = await response.blob();
          window.__carrotCaptureVideoBlob = blob;
          return {{ size: blob.size, type: blob.type }};
        }})()
    """, await_promise=True)
    size = metadata.get("size") if isinstance(metadata, dict) else None
    if not isinstance(size, int) or size <= 0:
        raise RuntimeError("browser video blob was empty")
    if size > MAX_VIDEO_BYTES:
        raise ValueError("video exceeds download size limit")

    _write_browser_blob(page, "__carrotCaptureVideoBlob", size, destination, "video")


def _write_browser_blob(
    page: CdpPage,
    variable_name: str,
    size: int,
    destination: Path,
    label: str,
) -> None:
    print(f"Saving browser {label} ({size / 1024 / 1024:.1f} MB)…")
    with destination.open("wb") as video_file:
        for offset in range(0, size, BLOB_DOWNLOAD_CHUNK_BYTES):
            chunk_end = min(offset + BLOB_DOWNLOAD_CHUNK_BYTES, size)
            encoded = page.evaluate(f"""
                (async () => {{
                  const buffer = await window.{variable_name}.slice({offset}, {chunk_end}).arrayBuffer();
                  const bytes = new Uint8Array(buffer);
                  let binary = '';
                  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
                  return btoa(binary);
                }})()
            """, await_promise=True)
            video_file.write(base64.b64decode(encoded))


def _transcribe_browser_blob(page: CdpPage, blob_url: str) -> str:
    with tempfile.TemporaryDirectory(prefix="carrot-instagram-capture-") as directory:
        video_path = Path(directory) / "video"
        audio_path = Path(directory) / "audio.mp3"
        _download_browser_blob(page, blob_url, video_path)
        print("Extracting audio with FFmpeg…")
        process = subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(video_path), "-vn", "-t", "600", "-ac", "1",
                "-ar", "16000", "-b:a", "48k", str(audio_path),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=90,
            check=False,
        )
        if process.returncode:
            raise RuntimeError(f"audio extraction failed: {process.stderr.decode(errors='replace')[-500:]}")
        audio_data = audio_path.read_bytes()
        if not audio_data:
            raise RuntimeError("audio extraction produced no audio")
        if len(audio_data) > MAX_AUDIO_BYTES:
            raise ValueError("audio exceeds Gemini inline upload limit")

        print("Sending audio to Gemini for transcription…")
        return asyncio.run(gemini.transcribe_audio(audio_data)).strip()


def _transcribe_browser_audio(page: CdpPage) -> str:
    print("Waiting for Instagram's full reel stream…")
    metadata = page.evaluate("""
        (async () => {
          const video = document.querySelector('video');
          if (!video?.captureStream) throw new Error('Chrome cannot capture the reel media stream');
          await video.play().catch(() => undefined);
          const fullStreamDeadline = Date.now() + """ + str(FULL_REEL_WAIT_SECONDS * 1000) + """;
          let previousTime = video.currentTime;
          let sawPreviewRestart = false;
          while (Date.now() < fullStreamDeadline) {
            if (Number.isFinite(video.duration) && video.duration >= 10 && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) break;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (video.currentTime + 0.25 < previousTime) sawPreviewRestart = true;
            if (sawPreviewRestart && video.currentTime > 5.5 && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) break;
            previousTime = video.currentTime;
          }
          const stream = video.captureStream();
          const audioTracks = stream.getAudioTracks();
          if (!audioTracks.length) throw new Error('Instagram did not expose an audio track to Chrome capture');
          const recorder = new MediaRecorder(new MediaStream(audioTracks), { mimeType: 'audio/webm;codecs=opus' });
          const chunks = [];
          const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
          recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
          const durationMilliseconds = Math.min(Math.max((video.duration || 60) * 1000 + 1000, 1000), 600000);
          video.currentTime = 0;
          recorder.start();
          await video.play();
          await new Promise((resolve) => setTimeout(resolve, durationMilliseconds));
          recorder.stop();
          await stopped;
          window.__carrotCaptureAudioBlob = new Blob(chunks, { type: 'audio/webm' });
          return { size: window.__carrotCaptureAudioBlob.size };
        })()
    """, await_promise=True)
    size = metadata.get("size") if isinstance(metadata, dict) else None
    if not isinstance(size, int) or size <= 0:
        raise RuntimeError("browser audio recording was empty")
    if size > MAX_AUDIO_BYTES:
        raise ValueError("browser audio recording exceeds upload size limit")

    with tempfile.TemporaryDirectory(prefix="carrot-instagram-audio-") as directory:
        recording_path = Path(directory) / "audio.webm"
        mp3_path = Path(directory) / "audio.mp3"
        _write_browser_blob(page, "__carrotCaptureAudioBlob", size, recording_path, "audio recording")
        print("Converting recorded audio with FFmpeg…")
        process = subprocess.run(
            ["ffmpeg", "-y", "-i", str(recording_path), "-ac", "1", "-ar", "16000", "-b:a", "48k", str(mp3_path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=90,
            check=False,
        )
        if process.returncode:
            raise RuntimeError(f"audio conversion failed: {process.stderr.decode(errors='replace')[-500:]}")
        print("Sending recorded audio to Gemini for transcription…")
        return asyncio.run(gemini.transcribe_audio(mp3_path.read_bytes())).strip()


def _full_video_url(video_url: str) -> str:
    parsed = urllib.parse.urlsplit(video_url)
    query = [
        (name, value)
        for name, value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        if name not in {"bytestart", "byteend"}
    ]

    return urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))


def _transcribe_video(
    page: CdpPage,
    video_url: str,
    media_urls: list[str],
) -> tuple[str | None, str | None]:
    candidates = list(dict.fromkeys([*media_urls, video_url]))
    errors: list[str] = []
    for candidate in candidates:
        try:
            if candidate.startswith("blob:"):
                transcript = _transcribe_browser_blob(page, candidate)
            else:
                print("Downloading media stream and extracting audio…")
                transcript = asyncio.run(transcribe_video(_full_video_url(candidate))).strip()
        except Exception as exc:
            errors.append(str(exc))
            continue
        if transcript:
            return transcript, None
        errors.append("Gemini returned an empty transcript")

    try:
        print("Recording the reel audio in Chrome…")
        transcript = _transcribe_browser_audio(page)
        if transcript:
            return transcript, None
        errors.append("Gemini returned an empty transcript from the browser recording")
    except Exception as exc:
        errors.append(str(exc))

    return None, " | ".join(errors[-3:])


def capture_url(
    port: int,
    source_url: str,
    comment_load_limit: int,
    page_load_timeout: int,
    skip_transcription: bool,
) -> dict[str, Any]:
    page = _new_page(port, source_url)
    try:
        is_ready = _wait_for_post(page, source_url, page_load_timeout)
        _expand_comments(page, comment_load_limit)
        data = _capture_visible_data(page)
        media_urls = page.media_urls()
        errors: list[str] = []
        if not is_ready:
            errors.append(f"Instagram post did not become ready within {page_load_timeout} seconds.")
        if not data["creator_handle"]:
            errors.append("Post owner was not visible. Confirm that Chrome is logged in and the post is accessible.")
        if not data["description"]:
            errors.append("Caption was not visible in the loaded post DOM.")
        transcript = None
        transcription_error = None
        if data["video_url"] and not skip_transcription:
            transcript, transcription_error = _transcribe_video(page, data["video_url"], media_urls)
            if transcription_error:
                errors.append(f"Audio transcription failed: {transcription_error}")

        return build_fixture(
            source_url=source_url,
            description=data["description"],
            creator_handle=data["creator_handle"],
            thumbnail_url=data["thumbnail_url"],
            video_url=data["video_url"],
            comments=data["comments"],
            audio_title=data["audio_title"],
            transcript=transcript,
            transcription_error=transcription_error,
            errors=errors,
        )
    finally:
        page.close()


def capture_html_url(source_url: str) -> dict[str, Any]:
    with httpx.Client(
        follow_redirects=True,
        timeout=30,
        headers={"User-Agent": "Carrot fixture capture/1.0"},
    ) as client:
        response = client.get(source_url)
        response.raise_for_status()

    return build_html_fixture(str(response.url), response.text, errors=[])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture local Instagram ExtractorV2 fixtures.")
    parser.add_argument("urls", nargs="*", help="Instagram post or Reel URLs")
    parser.add_argument("--input-file", type=Path, help="Newline-delimited URL file")
    parser.add_argument("--input-json", type=Path, help="JSON URL array, such as production-recipe-source-urls.json")
    parser.add_argument("--html-url", dest="html_urls", action="append", default=[], help="Raw HTML URL to capture")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--profile-dir", type=Path, default=DEFAULT_PROFILE_DIR)
    parser.add_argument("--chrome-path", type=Path, default=DEFAULT_CHROME_PATH)
    parser.add_argument("--comment-load-limit", type=int, default=10)
    parser.add_argument("--page-load-timeout", type=int, default=PAGE_LOAD_TIMEOUT_SECONDS)
    parser.add_argument("--skip-transcription", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    direct_instagram_urls, direct_html_urls = _read_source_urls(args)
    json_instagram_urls, json_html_urls = _read_json_urls(args.input_json)
    urls = list(dict.fromkeys([*direct_instagram_urls, *json_instagram_urls]))
    html_urls = list(dict.fromkeys([
        *direct_html_urls,
        *_read_html_urls(args),
        *json_html_urls,
    ]))
    if not urls and not html_urls:
        raise ValueError("Provide an Instagram URL, --input-file, or --html-url.")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    failed_urls: list[dict[str, Any]] = []
    _write_failed_urls(args.output_dir, failed_urls)
    chrome = None
    if urls:
        chrome = _start_chrome(args.chrome_path, args.profile_dir, port=9222)
        print("Chrome is open at Instagram login. Log in if needed, then press Enter here to begin capture.")
        input()

    try:
        for source_url in urls:
            output_path = _output_path(args.output_dir, source_url)
            if output_path.exists() and not args.overwrite:
                print(f"Skipped existing fixture: {output_path}")
                continue

            try:
                fixture = capture_url(
                    9222,
                    source_url,
                    args.comment_load_limit,
                    args.page_load_timeout,
                    args.skip_transcription,
                )
            except Exception as exc:
                failed_urls.append({
                    "source_url": source_url,
                    "kind": "social",
                    "errors": [f"Unexpected capture failure: {exc}"],
                })
                _write_failed_urls(args.output_dir, failed_urls)
                print(f"Failed to capture: {source_url}")
                continue
            temporary_path = output_path.with_suffix(".json.tmp")
            temporary_path.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            temporary_path.replace(output_path)
            if fixture["capture"]["status"] != "complete":
                failed_urls.append({
                    "source_url": source_url,
                    "kind": "social",
                    "errors": fixture["capture"]["errors"],
                })
                _write_failed_urls(args.output_dir, failed_urls)
            print(f"Saved {fixture['capture']['status']} fixture: {output_path}")

        for source_url in html_urls:
            output_path = _html_output_path(args.output_dir, source_url)
            if output_path.exists() and not args.overwrite:
                print(f"Skipped existing fixture: {output_path}")
                continue

            try:
                fixture = capture_html_url(source_url)
            except Exception as exc:
                fixture = build_html_fixture(source_url, "", errors=[str(exc)])

            temporary_path = output_path.with_suffix(".json.tmp")
            temporary_path.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            temporary_path.replace(output_path)
            if fixture["capture"]["status"] != "complete":
                failed_urls.append({
                    "source_url": source_url,
                    "kind": "html",
                    "errors": fixture["capture"]["errors"],
                })
                _write_failed_urls(args.output_dir, failed_urls)
            print(f"Saved {fixture['capture']['status']} fixture: {output_path}")
    finally:
        if chrome:
            chrome.terminate()


if __name__ == "__main__":
    main()
