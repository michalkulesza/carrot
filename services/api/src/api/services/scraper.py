from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

import httpx

from api.config import settings

log = logging.getLogger(__name__)

_BASE = "https://api.scrapecreators.com"
_URL_RE = re.compile(r"https?://[^\s]+")


class ScrapeCreatorsHttpError(httpx.HTTPStatusError):
    def __init__(self, response: httpx.Response, endpoint: str) -> None:
        super().__init__(
            f"ScrapeCreators {endpoint} request failed with status {response.status_code}",
            request=response.request,
            response=response,
        )
        self.endpoint = endpoint


@dataclass
class ReelMetadata:
    source_url: str
    canonical_url: str
    description: str
    thumbnail_url: str | None
    creator_handle: str | None
    video_url: str | None
    linked_urls: list[str] = field(default_factory=list)


class ScrapeCreatorsClient:
    def __init__(self) -> None:
        self._headers = {
            "x-api-key": settings.scrapecreators_api_key,
            "x-cache-max-age": "7d",
        }

    def _platform(self, url: str) -> str:
        if "tiktok.com" in url:
            return "tiktok"
        return "instagram"

    async def _get(self, endpoint: str, url: str) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(endpoint, headers=self._headers, params={"url": url})
        if response.is_error:
            raise ScrapeCreatorsHttpError(response, endpoint)
        return response.json()

    async def fetch_reel(self, url: str) -> ReelMetadata:
        platform = self._platform(url)
        endpoint = (
            f"{_BASE}/v1/tiktok/video" if platform == "tiktok"
            else f"{_BASE}/v1/instagram/post"
        )
        data = await self._get(endpoint, url)

        import json as _json
        log.debug("ScrapeCreators raw response: %s", _json.dumps(data, indent=2)[:3000])

        if platform == "tiktok":
            description = data.get("desc", "") or ""
            thumbnail_url = data.get("cover", data.get("dynamicCover"))
            creator_handle = (data.get("author") or {}).get("uniqueId")
            video_url = data.get("video_url") or data.get("play") or (data.get("video") or {}).get("playAddr")
            canonical_url = url
        else:
            # Instagram response: data.data.xdt_shortcode_media
            media = (data.get("data") or {}).get("xdt_shortcode_media") or {}
            edges = (media.get("edge_media_to_caption") or {}).get("edges") or []
            description = edges[0]["node"]["text"] if edges else ""
            thumbnail_url = media.get("thumbnail_src") or media.get("display_url")
            creator_handle = (media.get("owner") or {}).get("username")
            video_url = media.get("video_url") or data.get("video_url")
            canonical_url = url

        linked_urls = _URL_RE.findall(description)
        return ReelMetadata(
            source_url=url,
            canonical_url=canonical_url,
            description=description,
            thumbnail_url=thumbnail_url,
            creator_handle=creator_handle,
            video_url=video_url if isinstance(video_url, str) else None,
            linked_urls=linked_urls,
        )


scraper = ScrapeCreatorsClient()
