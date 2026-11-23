import io
from dataclasses import dataclass

import httpx
from PIL import Image

from api.config import settings

USER_AGENT = {"User-Agent": "Mozilla/5.0"}
BLOCKED_STATUSES = frozenset({403, 429, 503})


class ImageFetchError(Exception):
    pass


@dataclass(frozen=True)
class ImageProbe:
    proxy: str
    content_type: str


def _content_type(response: httpx.Response, default: str = "") -> str:
    return response.headers.get("content-type", default).split(";")[0].strip().casefold()


def _identifiable_image(data: bytes) -> bool:
    try:
        Image.open(io.BytesIO(data))
    except Exception:
        return False
    return True


def _is_image_body(response: httpx.Response) -> bool:
    content_type = _content_type(response)
    if content_type.startswith("image/"):
        return True
    if "html" in content_type:
        return False
    return _identifiable_image(response.content)


def _should_retry_residential(status: int, is_image: bool) -> bool:
    if not settings.residential_proxy_url:
        return False
    return status in BLOCKED_STATUSES or (status < 400 and not is_image)


async def _get(url: str, proxy: str) -> httpx.Response:
    async with httpx.AsyncClient(follow_redirects=True, timeout=15, proxy=proxy or None) as client:
        return await client.get(url, headers=USER_AGENT)


async def fetch_image(url: str) -> httpx.Response:
    """GET an image via the outbound proxy, retrying once via the residential proxy when blocked or served a non-image."""
    response = await _get(url, settings.outbound_proxy_url)
    if _should_retry_residential(response.status_code, response.status_code < 400 and _is_image_body(response)):
        response = await _get(url, settings.residential_proxy_url)

    response.raise_for_status()
    if not _is_image_body(response):
        raise ImageFetchError(f"response is not an image (content-type {_content_type(response) or 'missing'})")
    return response


async def _head(url: str, proxy: str) -> httpx.Response:
    async with httpx.AsyncClient(timeout=10, follow_redirects=True, proxy=proxy or None) as client:
        return await client.head(url, headers=USER_AGENT)


def _head_is_image(response: httpx.Response) -> bool:
    return _content_type(response, "image/jpeg").startswith("image/")


async def probe_image(url: str) -> ImageProbe:
    """HEAD an image to pick the proxy that can reach it, falling back once to the residential proxy."""
    response = await _head(url, settings.outbound_proxy_url)
    proxy = settings.outbound_proxy_url
    if _should_retry_residential(response.status_code, _head_is_image(response)):
        response = await _head(url, settings.residential_proxy_url)
        proxy = settings.residential_proxy_url

    if response.status_code in BLOCKED_STATUSES or not _head_is_image(response):
        raise ImageFetchError("URL is not an image")
    return ImageProbe(proxy=proxy, content_type=_content_type(response, "image/jpeg"))
