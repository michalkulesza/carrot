from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

import httpx

from api.config import settings

log = logging.getLogger(__name__)

_BASE = "https://api.scrapecreators.com"
_URL_RE = re.compile(r"https?://[^\s]+")
_MAX_SCRAPER_RESPONSE_BYTES = 4 * 1024 * 1024


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
    creator_id: str | None = None
    linked_urls: list[str] = field(default_factory=list)
    raw_response: dict = field(default_factory=dict)
    comments: list[dict] = field(default_factory=list)


def parse_scrapecreators_reel_response(data: dict, url: str) -> ReelMetadata:
    platform = "tiktok" if "tiktok.com" in url else "instagram"

    if platform == "tiktok":
        description = data.get("desc", "") or ""
        thumbnail_url = data.get("cover", data.get("dynamicCover"))
        creator_handle = (data.get("author") or {}).get("uniqueId")
        creator_id = (data.get("author") or {}).get("id") or (data.get("author") or {}).get("uid")
        video_url = data.get("video_url") or data.get("play") or (data.get("video") or {}).get("playAddr")
        canonical_url = url
    else:
        media = (data.get("data") or {}).get("xdt_shortcode_media") or {}
        edges = (media.get("edge_media_to_caption") or {}).get("edges") or []
        description = edges[0]["node"]["text"] if edges else ""
        thumbnail_url = media.get("thumbnail_src") or media.get("display_url")
        creator_handle = (media.get("owner") or {}).get("username")
        creator_id = (media.get("owner") or {}).get("id") or (media.get("owner") or {}).get("pk")
        video_url = media.get("video_url") or data.get("video_url")
        canonical_url = url

    linked_urls = _URL_RE.findall(description)

    comments = data.get("comments") or (data.get("data") or {}).get("comments") or []
    if not comments and platform == "instagram":
        media = (data.get("data") or {}).get("xdt_shortcode_media") or {}
        comment_edges = (media.get("edge_media_to_parent_comment") or {}).get("edges") or []
        comments = comment_edges
    if isinstance(comments, dict):
        comments = comments.get("edges") or comments.get("items") or []
    normalized_comments = []
    for item in comments if isinstance(comments, list) else []:
        node = item.get("node", item) if isinstance(item, dict) else {}
        if not isinstance(node, dict):
            continue
        author = node.get("owner") or node.get("user") or node.get("author") or {}
        if not isinstance(author, dict):
            author = {}
        text = node.get("text") or node.get("comment") or node.get("content")
        if not isinstance(text, str) or not text.strip():
            continue
        normalized_comments.append({
            "id": str(node.get("id")) if node.get("id") is not None else None,
            "parent_comment_id": str(node.get("parent_comment_id")) if node.get("parent_comment_id") is not None else None,
            "author_id": str(author.get("id") or author.get("pk") or "") or None,
            "author_handle": author.get("username") or author.get("uniqueId") or author.get("handle"),
            "text": text,
            "is_creator_authored": next((node[key] for key in ("is_owner", "is_creator", "author_is_owner") if isinstance(node.get(key), bool)), None),
            "authorship_evidence": "provider_creator_flag" if any(isinstance(node.get(key), bool) for key in ("is_owner", "is_creator", "author_is_owner")) else "provider_comment_author_id" if author.get("id") or author.get("pk") else None,
        })

    return ReelMetadata(
        source_url=url,
        canonical_url=canonical_url,
        description=description,
        thumbnail_url=thumbnail_url,
        creator_handle=creator_handle,
        creator_id=str(creator_id) if creator_id is not None else None,
        video_url=video_url if isinstance(video_url, str) else None,
        linked_urls=linked_urls,
        raw_response=data,
        comments=normalized_comments,
    )


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
        async with httpx.AsyncClient(timeout=httpx.Timeout(20, connect=8)) as client:
            async with client.stream("GET", endpoint, headers=self._headers, params={"url": url}) as response:
                if response.is_error:
                    await response.aread()
                    raise ScrapeCreatorsHttpError(response, endpoint)
                content_length = response.headers.get("content-length")
                if content_length and int(content_length) > _MAX_SCRAPER_RESPONSE_BYTES:
                    raise ValueError("ScrapeCreators response exceeds size limit")
                chunks = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > _MAX_SCRAPER_RESPONSE_BYTES:
                        raise ValueError("ScrapeCreators response exceeds size limit")
                    chunks.append(chunk)
                response._content = b"".join(chunks)
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

        return parse_scrapecreators_reel_response(data, url)


scraper = ScrapeCreatorsClient()
