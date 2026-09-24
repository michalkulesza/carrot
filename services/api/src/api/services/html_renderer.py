"""Client for the isolated, bounded Chromium renderer."""
from __future__ import annotations

from dataclasses import dataclass

import httpx

from api.config import settings

_AsyncClient = httpx.AsyncClient


@dataclass(frozen=True)
class RenderedPage:
    requested_url: str
    final_url: str
    html: str
    duration_ms: int


class RendererFailure(RuntimeError):
    def __init__(self, category: str, *, operational: bool):
        super().__init__(category)
        self.category = category
        self.operational = operational


async def render_url(url: str) -> RenderedPage:
    try:
        async with _AsyncClient(timeout=settings.renderer_timeout_seconds) as client:
            response = await client.post(f"{settings.renderer_url.rstrip('/')}/v1/render", json={"url": url})
        data = response.json()
    except (httpx.HTTPError, ValueError):
        raise RendererFailure("renderer_unavailable", operational=True) from None
    if not response.is_success or not isinstance(data, dict) or data.get("ok") is not True:
        category = data.get("failure", "renderer_failed") if isinstance(data, dict) else "renderer_failed"
        operational = category not in {"unsafe_url", "unsafe_redirect"}
        raise RendererFailure(str(category), operational=operational)
    if not all(isinstance(data.get(key), str) for key in ("requested_url", "final_url", "html")):
        raise RendererFailure("invalid_renderer_response", operational=True)
    if not data["html"].strip():
        raise RendererFailure("empty_html", operational=True)
    return RenderedPage(data["requested_url"], data["final_url"], data["html"], int(data.get("duration_ms", 0)))
