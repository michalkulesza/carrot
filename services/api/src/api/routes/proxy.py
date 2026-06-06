from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/proxy", tags=["proxy"])


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


@router.get("/image")
async def proxy_image(url: str) -> StreamingResponse:
    if not _allowed(url):
        raise HTTPException(status_code=403, detail="URL not allowed")

    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        head = await client.head(url, headers={"User-Agent": "Mozilla/5.0"})
        content_type = head.headers.get("content-type", "image/jpeg")

    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="URL is not an image")

    async def stream():
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            async with client.stream("GET", url, headers={"User-Agent": "Mozilla/5.0"}) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes(8192):
                    yield chunk

    return StreamingResponse(
        stream(),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400, immutable"},
    )
