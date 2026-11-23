import asyncio
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse

from api.services.image_fetch import USER_AGENT, ImageFetchError, ImageProbe, probe_image
from api.services.image_resize import resize_jpeg
from api.services.r2 import SMALL_QUALITY, SMALL_WIDTH

router = APIRouter(prefix="/proxy", tags=["proxy"])

CACHE_CONTROL = "public, max-age=31536000"
MAX_RESIZE_SOURCE_BYTES = 20 * 1024 * 1024


def _allowed(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.hostname or ""
    # Block private/loopback ranges
    return not (
        host == "localhost"
        or host.startswith("127.")
        or host.startswith("192.168.")
        or host.startswith("10.")
        or host == "0.0.0.0"
    )


async def _download_capped(url: str, probe: ImageProbe) -> bytes:
    chunks: list[bytes] = []
    size = 0
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, proxy=probe.proxy or None) as client:
        async with client.stream("GET", url, headers=USER_AGENT) as r:
            r.raise_for_status()
            async for chunk in r.aiter_bytes(8192):
                size += len(chunk)
                if size > MAX_RESIZE_SOURCE_BYTES:
                    raise HTTPException(status_code=413, detail="Image too large")
                chunks.append(chunk)
    return b"".join(chunks)


async def _resized_response(url: str, probe: ImageProbe) -> Response:
    try:
        data = await _download_capped(url, probe)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Failed to fetch image")

    try:
        body = await asyncio.to_thread(resize_jpeg, data, SMALL_WIDTH, SMALL_QUALITY)
    except Exception:
        raise HTTPException(status_code=422, detail="Unsupported image")
    return Response(content=body, media_type="image/jpeg", headers={"Cache-Control": CACHE_CONTROL})


@router.get("/image")
async def proxy_image(url: str, w: int | None = None) -> Response:
    if w is not None and w != SMALL_WIDTH:
        raise HTTPException(status_code=422, detail=f"w must be {SMALL_WIDTH}")
    if not _allowed(url):
        raise HTTPException(status_code=403, detail="URL not allowed")

    try:
        probe = await probe_image(url)
    except ImageFetchError:
        raise HTTPException(status_code=400, detail="URL is not an image")

    if w is not None:
        return await _resized_response(url, probe)

    async def stream():
        async with httpx.AsyncClient(timeout=15, follow_redirects=True, proxy=probe.proxy or None) as client:
            async with client.stream("GET", url, headers=USER_AGENT) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes(8192):
                    yield chunk

    return StreamingResponse(
        stream(),
        media_type=probe.content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
