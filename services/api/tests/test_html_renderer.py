from __future__ import annotations

import httpx
import pytest

from api.services import html_renderer
from api.services.html_renderer import RendererFailure, render_url


def _render_with(monkeypatch, body: dict) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=body)

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(html_renderer, "_AsyncClient", lambda **kwargs: httpx.AsyncClient(transport=transport, **kwargs))


def _body(**extra) -> dict:
    return {"ok": True, "requested_url": "https://a.test", "final_url": "https://a.test", "html": "<p>x</p>", **extra}


@pytest.mark.asyncio
async def test_error_status_is_an_operational_renderer_failure(monkeypatch) -> None:
    _render_with(monkeypatch, _body(response_status=403))

    with pytest.raises(RendererFailure) as error:
        await render_url("https://a.test")

    assert error.value.category == "http_403"
    assert error.value.operational is True


@pytest.mark.asyncio
async def test_success_status_is_exposed(monkeypatch) -> None:
    _render_with(monkeypatch, _body(response_status=200))

    assert (await render_url("https://a.test")).response_status == 200


@pytest.mark.asyncio
async def test_missing_status_is_accepted(monkeypatch) -> None:
    _render_with(monkeypatch, _body())

    assert (await render_url("https://a.test")).response_status is None
