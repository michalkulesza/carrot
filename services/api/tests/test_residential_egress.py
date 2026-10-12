"""Residential egress fallback (home Raspberry Pi) after a bot challenge on the normal path."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import httpx
import pytest

from api.config import settings
from api.models import ImportMetadata, ImportResult, ImportStage
from api.services import gemini, import_worker
from api.services.extraction_v2 import production
from api.services.extraction_v2.contracts import FailedOutcome, FailureReason
from api.services.html_renderer import RenderedPage, RendererFailure

URL = "https://www.fiordifrolla.it/bolzano-apple-cake/"
CLEAN = "<html><body>recipe</body></html>"
BLOCKED_PAGE = "<html><title>Just a moment...</title></html>"
RES_PROXY = "socks5h://host.docker.internal:40002"
RES_RENDERER = "http://renderer-residential:8080"


async def _safe(_url):
    return True


@pytest.fixture
def setup(monkeypatch):
    """Normal path always blocked; returns call logs. Residential config set per test."""
    calls = {"render": [], "raw": []}
    monkeypatch.setattr(settings, "residential_proxy_url", "")
    monkeypatch.setattr(settings, "residential_renderer_url", "")
    monkeypatch.setattr(production, "is_safe_public_destination", _safe)

    async def extract(payload):
        return FailedOutcome(outcome="failed", source_url=URL, evidence=[], trace=[],
                             reason=FailureReason.NO_RECIPE_CONTENT, failed_stage="text")

    monkeypatch.setattr(production, "create_production_orchestrator", lambda _u: SimpleNamespace(extract=extract))
    return calls


def _patch(monkeypatch, calls, *, residential_render=None, residential_raw=None):
    async def render(_url, renderer_url=None):
        calls["render"].append(renderer_url)
        if renderer_url is None:
            return RenderedPage(URL, URL, BLOCKED_PAGE, 10)
        outcome = residential_render
        if isinstance(outcome, Exception):
            raise outcome
        return RenderedPage(URL, URL, outcome, 10)

    async def raw(_url, proxy=None):
        calls["raw"].append(proxy)
        if proxy is None:
            raise production.SourceBlocked("challenge")
        if isinstance(residential_raw, Exception):
            raise residential_raw
        return residential_raw, URL

    monkeypatch.setattr(production, "render_url", render)
    monkeypatch.setattr(production, "_fetch_html", raw)


async def _acquire():
    return await production.acquire_and_extract_url(URL, gemini.UsageTracker())


@pytest.mark.asyncio
async def test_feature_off_never_touches_residential(monkeypatch, setup) -> None:
    _patch(monkeypatch, setup, residential_render=CLEAN, residential_raw=CLEAN)
    outcome, _m, capture = await _acquire()
    assert outcome.reason == FailureReason.SOURCE_BLOCKED and capture == {}
    assert setup["render"] == [None] and setup["raw"] == [None]


@pytest.mark.asyncio
async def test_residential_renderer_success(monkeypatch, setup) -> None:
    monkeypatch.setattr(settings, "residential_proxy_url", RES_PROXY)
    monkeypatch.setattr(settings, "residential_renderer_url", RES_RENDERER)
    _patch(monkeypatch, setup, residential_render=CLEAN)
    _o, _m, capture = await _acquire()
    assert capture["render_status"] == "residential_rendered"
    assert setup["render"] == [None, RES_RENDERER] and setup["raw"] == [None]


@pytest.mark.asyncio
@pytest.mark.parametrize("render_result", [BLOCKED_PAGE, RendererFailure("timeout", operational=True)])
async def test_residential_raw_fallback_after_renderer_challenge_or_failure(monkeypatch, setup, render_result) -> None:
    monkeypatch.setattr(settings, "residential_proxy_url", RES_PROXY)
    monkeypatch.setattr(settings, "residential_renderer_url", RES_RENDERER)
    _patch(monkeypatch, setup, residential_render=render_result, residential_raw=CLEAN)
    _o, _m, capture = await _acquire()
    assert capture["render_status"] == "residential_raw_fallback"
    assert setup["raw"] == [None, RES_PROXY]


@pytest.mark.asyncio
async def test_proxy_only_skips_residential_renderer(monkeypatch, setup) -> None:
    monkeypatch.setattr(settings, "residential_proxy_url", RES_PROXY)
    _patch(monkeypatch, setup, residential_raw=CLEAN)
    _o, _m, capture = await _acquire()
    assert capture["render_status"] == "residential_raw_fallback" and setup["render"] == [None]


@pytest.mark.asyncio
@pytest.mark.parametrize("raw_error", [
    production.SourceBlocked("still blocked"),
    httpx.ConnectError("tunnel down"),
    httpx.ReadTimeout("slow"),
    httpx.HTTPStatusError("403", request=httpx.Request("GET", URL), response=httpx.Response(403)),
])
async def test_still_blocked_or_tunnel_down_is_source_blocked(monkeypatch, setup, raw_error) -> None:
    monkeypatch.setattr(settings, "residential_proxy_url", RES_PROXY)
    monkeypatch.setattr(settings, "residential_renderer_url", RES_RENDERER)
    _patch(monkeypatch, setup, residential_render=RendererFailure("renderer_unavailable", operational=True), residential_raw=raw_error)
    outcome, _m, capture = await _acquire()
    assert outcome.reason == FailureReason.SOURCE_BLOCKED and capture == {}


@pytest.mark.asyncio
async def test_ordinary_error_on_residential_fetch_is_fetch_failed(monkeypatch, setup) -> None:
    monkeypatch.setattr(settings, "residential_proxy_url", RES_PROXY)
    _patch(monkeypatch, setup, residential_raw=ValueError("not html"))
    outcome, _m, _c = await _acquire()
    assert outcome.reason == FailureReason.SOURCE_FETCH_FAILED


@pytest.mark.asyncio
async def test_residential_not_used_when_normal_path_fails_without_challenge(monkeypatch, setup) -> None:
    monkeypatch.setattr(settings, "residential_proxy_url", RES_PROXY)

    async def render(_url, renderer_url=None):
        raise RendererFailure("timeout", operational=True)

    async def raw(_url, proxy=None):
        raise ValueError("boom")

    monkeypatch.setattr(production, "render_url", render)
    monkeypatch.setattr(production, "_fetch_html", raw)
    outcome, _m, _c = await _acquire()
    assert outcome.reason == FailureReason.SOURCE_FETCH_FAILED


@pytest.mark.asyncio
async def test_fetch_html_uses_given_proxy_and_safety_check(monkeypatch) -> None:
    created = []
    checked = []
    real = httpx.AsyncClient

    def factory(**kwargs):
        created.append(kwargs["proxy"])
        raise RuntimeError

    async def unsafe(url):
        checked.append(url)
        return False

    monkeypatch.setattr(settings, "outbound_proxy_url", "socks5://warp:1080")
    monkeypatch.setattr(production.httpx, "AsyncClient", factory)
    for proxy in (RES_PROXY, None):
        with pytest.raises(RuntimeError):
            await production._fetch_html(URL, proxy=proxy)
    assert created == [RES_PROXY, "socks5://warp:1080"]

    monkeypatch.setattr(production.httpx, "AsyncClient", lambda **kw: real(
        transport=httpx.MockTransport(lambda _r: httpx.Response(200, text="x")), **{**kw, "proxy": None}))
    monkeypatch.setattr(production, "is_safe_public_destination", unsafe)
    with pytest.raises(ValueError):
        await production._fetch_html(URL, proxy=RES_PROXY)
    assert checked == [URL]


@pytest.mark.asyncio
async def test_residential_attempts_limited_to_two_concurrent(monkeypatch, setup) -> None:
    monkeypatch.setattr(settings, "residential_renderer_url", RES_RENDERER)
    monkeypatch.setattr(production, "_residential_gate", asyncio.Semaphore(2))
    active = peak = 0

    async def render(_url, renderer_url=None):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.02)
        active -= 1
        return RenderedPage(URL, URL, CLEAN, 1)

    monkeypatch.setattr(production, "render_url", render)
    results = await asyncio.gather(*(production._acquire_residential(URL) for _ in range(5)))
    assert peak == 2 and all(r[2] == "residential_rendered" for r in results)


@pytest.mark.asyncio
async def test_render_url_uses_override_renderer_url(monkeypatch) -> None:
    from api.services import html_renderer

    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(200, json={"ok": True, "requested_url": URL, "final_url": URL, "html": CLEAN})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(html_renderer, "_AsyncClient", lambda **kw: httpx.AsyncClient(transport=transport, **kw))
    await html_renderer.render_url(URL, renderer_url="http://renderer-residential:8080/")
    await html_renderer.render_url(URL)
    assert seen == ["http://renderer-residential:8080/v1/render", f"{settings.renderer_url.rstrip('/')}/v1/render"]


# --- thumbnail archive retry ---

def _archive_env(monkeypatch, responses):
    monkeypatch.setattr(import_worker.settings, "r2_endpoint_url", "https://r2.example")
    monkeypatch.setattr(import_worker.settings, "r2_access_key_id", "k")
    monkeypatch.setattr(import_worker.settings, "r2_bucket_name", "b")
    monkeypatch.setattr(import_worker.settings, "r2_public_url", "https://images.example")
    monkeypatch.setattr(import_worker.settings, "outbound_proxy_url", "socks5://warp:1080")
    monkeypatch.setattr(import_worker.settings, "residential_proxy_url", RES_PROXY)
    proxies = []
    real = httpx.AsyncClient

    def factory(**kw):
        proxies.append(kw["proxy"])
        return real(transport=httpx.MockTransport(lambda _r: responses[len(proxies) - 1]), **{**kw, "proxy": None})

    monkeypatch.setattr(import_worker.httpx, "AsyncClient", factory)
    upload = Mock(return_value="https://images.example/t.jpg")
    monkeypatch.setattr(import_worker.r2_svc, "upload_image", upload)
    return proxies, upload


def _img(status=200, ctype="image/jpeg", body=b"img"):
    return httpx.Response(status, headers={"content-type": ctype}, content=body)


@pytest.mark.asyncio
@pytest.mark.parametrize("first", [_img(403), _img(429), _img(503), _img(200, "text/html", BLOCKED_PAGE.encode())])
async def test_thumbnail_retries_via_residential_when_blocked(monkeypatch, first) -> None:
    proxies, upload = _archive_env(monkeypatch, [first, _img()])
    recipe = SimpleNamespace(id=uuid4(), thumbnail_url="https://cdn.example/a.jpg")
    await import_worker._archive_thumbnail(recipe, residential=True)
    assert proxies == ["socks5://warp:1080", RES_PROXY]
    upload.assert_called_once() and recipe.thumbnail_url == "https://images.example/t.jpg"


@pytest.mark.asyncio
@pytest.mark.parametrize("residential,first", [(False, _img(403)), (True, _img(404))])
async def test_thumbnail_no_retry_when_not_residential_or_not_blocked(monkeypatch, residential, first) -> None:
    proxies, upload = _archive_env(monkeypatch, [first, _img()])
    recipe = SimpleNamespace(id=uuid4(), thumbnail_url="https://cdn.example/a.jpg")
    await import_worker._archive_thumbnail(recipe, residential=residential)
    assert proxies == ["socks5://warp:1080"] and recipe.thumbnail_url == "https://cdn.example/a.jpg"
    upload.assert_not_called()


@pytest.mark.asyncio
async def test_thumbnail_retries_at_most_once(monkeypatch) -> None:
    proxies, upload = _archive_env(monkeypatch, [_img(403), _img(403), _img()])
    recipe = SimpleNamespace(id=uuid4(), thumbnail_url="https://cdn.example/a.jpg")
    await import_worker._archive_thumbnail(recipe, residential=True)
    assert len(proxies) == 2
    upload.assert_not_called()


@pytest.mark.parametrize("capture,expected", [
    ({"render_status": "residential_rendered"}, True), ({"render_status": "residential_raw_fallback"}, True),
    ({"render_status": "rendered"}, False), ({}, False), (None, False),
])
def test_is_residential(capture, expected) -> None:
    assert import_worker._is_residential(ImportResult(
        stage=ImportStage.DESCRIPTION, metadata=ImportMetadata(), source_capture=capture or {})) is expected
