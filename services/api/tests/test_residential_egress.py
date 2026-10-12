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


# --- observability ---

def _attempt_lines(caplog):
    return [r.getMessage() for r in caplog.records if r.getMessage().startswith("fetch_attempt")]


@pytest.mark.asyncio
async def test_success_logs_attempt_line_without_url_details(monkeypatch, setup, caplog) -> None:
    import logging

    monkeypatch.setattr(settings, "residential_renderer_url", RES_RENDERER)
    _patch(monkeypatch, setup, residential_render=CLEAN)
    with caplog.at_level(logging.INFO, logger=production.log.name):
        await production._acquire_residential(URL + "?secret=1")
    lines = _attempt_lines(caplog)
    assert len(lines) == 1
    assert "route=residential step=render outcome=ok host=www.fiordifrolla.it duration_ms=" in lines[0] and lines[0].endswith("fallback=true")
    assert "secret" not in lines[0] and "bolzano" not in lines[0]
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]


@pytest.mark.asyncio
async def test_unreachable_pi_logs_warning_and_attempt_line(monkeypatch, setup, caplog) -> None:
    import logging

    monkeypatch.setattr(settings, "residential_proxy_url", RES_PROXY)
    _patch(monkeypatch, setup, residential_raw=httpx.ConnectError("tunnel down"))
    with caplog.at_level(logging.INFO, logger=production.log.name):
        with pytest.raises(production.SourceBlocked) as blocked:
            await production._acquire_residential(URL)
    assert any("step=raw outcome=unavailable" in line for line in _attempt_lines(caplog))
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert warnings == ["event=residential_unavailable host=www.fiordifrolla.it step=raw error=ConnectError"]
    assert (blocked.value.residential_step, blocked.value.residential_outcome) == ("raw", "unavailable")


@pytest.mark.asyncio
async def test_renderer_unavailable_warns_but_site_block_does_not(monkeypatch, setup, caplog) -> None:
    import logging

    monkeypatch.setattr(settings, "residential_renderer_url", RES_RENDERER)
    _patch(monkeypatch, setup, residential_render=RendererFailure("renderer_unavailable", operational=True))
    with caplog.at_level(logging.INFO, logger=production.log.name):
        with pytest.raises(production.SourceBlocked) as blocked:
            await production._acquire_residential(URL)
    assert blocked.value.residential_outcome == "renderer_unavailable"
    assert sum("event=residential_unavailable" in r.getMessage() for r in caplog.records) == 1
    caplog.clear()
    _patch(monkeypatch, setup, residential_render=BLOCKED_PAGE)
    with caplog.at_level(logging.INFO, logger=production.log.name):
        with pytest.raises(production.SourceBlocked) as blocked:
            await production._acquire_residential(URL)
    assert blocked.value.residential_outcome == "challenge"
    assert not [r for r in caplog.records if "residential_unavailable" in r.getMessage()]


class _TagScope:
    def __init__(self, tags):
        self.tags = tags

    def set_tag(self, key, value):
        self.tags[key] = value

    def set_context(self, *_a):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_a):
        return False


@pytest.mark.asyncio
async def test_blocked_failure_carries_attempt_and_import_report_tags(monkeypatch, setup) -> None:
    from api.services import monitoring

    monkeypatch.setattr(settings, "residential_proxy_url", RES_PROXY)
    _patch(monkeypatch, setup, residential_raw=production.SourceBlocked("still blocked"))
    outcome, _m, _c = await _acquire()
    assert outcome.reason == FailureReason.SOURCE_BLOCKED
    assert import_worker._residential_attempt(outcome) == ("raw", "challenge")

    tags = {}
    monkeypatch.setattr(monitoring.sentry_sdk, "new_scope", lambda: _TagScope(tags))
    monkeypatch.setattr(monitoring.sentry_sdk, "capture_message", lambda *_a, **_k: None)
    monitoring.report_recipe_import_failure(input_kind="html", reason="source_blocked", source_url=URL, residential_step="raw")
    assert tags["egress"] == "residential" and tags["residential_step"] == "raw"
    tags.clear()
    monitoring.report_recipe_import_failure(input_kind="html", reason="source_blocked", source_url=URL)
    assert "egress" not in tags


# --- persistence on the import job ---

def test_residential_attempt_from_trace_for_late_extraction_failure() -> None:
    from api.services.extraction_v2.contracts import ExtractionStage, TraceEvent

    failed = FailedOutcome(outcome="failed", source_url=URL, evidence=[], reason=FailureReason.NO_RECIPE_CONTENT,
                           failed_stage="text", trace=[TraceEvent(stage=ExtractionStage.INPUT, event="html_residential_rendered")])
    assert import_worker._residential_attempt(failed) == ("render", "ok")
    plain = FailedOutcome(outcome="failed", source_url=URL, evidence=[], trace=[],
                          reason=FailureReason.SOURCE_BLOCKED, failed_stage="input")
    assert import_worker._residential_attempt(plain) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("raw_error,expected", [
    (production.SourceBlocked("x"), ("raw", "challenge")),
    (httpx.ConnectError("down"), ("raw", "unavailable")),
    (httpx.HTTPStatusError("403", request=httpx.Request("GET", URL), response=httpx.Response(403)), ("raw", "http_403")),
])
async def test_failed_attempt_is_persisted_on_job(monkeypatch, setup, raw_error, expected) -> None:
    from api.models import ImportJob, ImportJobKind, ImportJobStatus

    monkeypatch.setattr(settings, "residential_proxy_url", RES_PROXY)
    _patch(monkeypatch, setup, residential_raw=raw_error)
    outcome, _m, _c = await _acquire()
    error = import_worker.ImportPipelineFailure("source_blocked", "input", import_worker._residential_attempt(outcome))
    job = ImportJob(id=uuid4(), kind=ImportJobKind.URL, status=ImportJobStatus.RUNNING, input={"url": URL},
                    user_id=uuid4(), retry_count=0, parent_recipe_id=None)
    session = SimpleNamespace(scalar=AsyncMock(return_value=job), commit=AsyncMock())

    class Ctx:
        async def __aenter__(self):
            return session

        async def __aexit__(self, *_):
            return False

    monkeypatch.setattr(import_worker, "async_session_maker", lambda: Ctx())
    monkeypatch.setattr(import_worker, "_event_for_job", AsyncMock())
    monkeypatch.setattr(import_worker, "finalize_parent_of_child", AsyncMock())
    reported = {}
    monkeypatch.setattr(import_worker, "report_recipe_import_failure", lambda **k: reported.update(k))
    await import_worker._fail_or_retry(job.id, error)
    assert (job.residential_step, job.residential_outcome) == expected
    assert reported["residential_step"] == "raw"


def test_successful_attempt_is_persisted_on_job() -> None:
    from api.models import ImportJob

    job = ImportJob()
    step = import_worker._RESIDENTIAL_STEP_BY_STATUS["residential_rendered"]
    import_worker._record_residential(job, (step, "ok"))
    assert (job.residential_step, job.residential_outcome) == ("render", "ok")
    other = ImportJob()
    import_worker._record_residential(other, None)
    assert other.residential_step is None and other.residential_outcome is None


@pytest.mark.asyncio
async def test_stats_script_query_function() -> None:
    import sys
    from datetime import datetime
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
    import residential_stats

    day = datetime(2026, 10, 1, 12)
    rows = [
        (day, "render", "ok", {}, "https://a.example/x?q=1"),
        (day, "raw", "challenge", {"url": "https://b.example/y"}, None),
        (day, "raw", "unavailable", {"url": "https://b.example/z"}, None),
    ]
    from collections import namedtuple

    Row = namedtuple("Row", "created_at residential_step residential_outcome input source_url")
    session = SimpleNamespace(
        scalar=AsyncMock(return_value=10),
        execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [Row(*r) for r in rows])),
    )
    stats = await residential_stats.fetch_stats(session, 30)
    assert stats["total_url_imports"] == 10 and stats["residential_attempts"] == 3
    assert stats["by_outcome"] == {"ok": 1, "challenge": 1, "unavailable": 1}
    assert stats["by_step"] == {"render": 1, "raw": 2}
    assert stats["success_rate"] == pytest.approx(1 / 3)
    assert stats["per_day"] == {"2026-10-01": 3}
    assert stats["top_hosts"] == [("b.example", 2), ("a.example", 1)]


# --- Sentry error events (A) and Sentry Logs (B) ---

@pytest.fixture
def sentry(monkeypatch):
    from api.services import monitoring

    class Scope(_TagScope):
        def __init__(self):
            super().__init__({})
            self.fingerprint = None

    spy = SimpleNamespace(errors=[], logs=[])

    def new_scope():
        scope = Scope()
        spy.errors.append([scope, None, None])
        return scope

    def capture(message, level):
        spy.errors[-1][1:] = [message, level]

    monkeypatch.setattr(monitoring.sentry_sdk, "new_scope", new_scope)
    monkeypatch.setattr(monitoring.sentry_sdk, "capture_message", capture)
    monkeypatch.setattr(monitoring.sentry_logger, "info", lambda template, **kw: spy.logs.append((template, kw)))
    return spy


@pytest.mark.asyncio
async def test_unreachable_pi_sends_one_grouped_sentry_error(monkeypatch, setup, sentry) -> None:
    monkeypatch.setattr(settings, "residential_proxy_url", RES_PROXY)
    _patch(monkeypatch, setup, residential_raw=httpx.ConnectError("tunnel down"))
    with pytest.raises(production.SourceBlocked):
        await production._acquire_residential(URL + "?secret=1")
    assert len(sentry.errors) == 1
    scope, message, level = sentry.errors[0]
    assert level == "error" and "secret" not in message and "http" not in message
    assert scope.fingerprint == ["residential-egress", "unavailable"]
    assert scope.tags == {"egress": "residential", "step": "raw", "outcome": "unavailable", "host": "www.fiordifrolla.it"}


@pytest.mark.asyncio
async def test_still_blocked_sends_blocked_sentry_error(monkeypatch, setup, sentry) -> None:
    monkeypatch.setattr(settings, "residential_proxy_url", RES_PROXY)
    http403 = httpx.HTTPStatusError("403", request=httpx.Request("GET", URL), response=httpx.Response(403))
    _patch(monkeypatch, setup, residential_raw=http403)
    with pytest.raises(production.SourceBlocked):
        await production._acquire_residential(URL)
    assert len(sentry.errors) == 1
    scope = sentry.errors[0][0]
    assert scope.fingerprint == ["residential-egress", "blocked"]
    assert scope.tags["outcome"] == "http_403" and scope.tags["step"] == "raw" and scope.tags["egress"] == "residential"


@pytest.mark.asyncio
async def test_residential_success_sends_no_sentry_error_but_one_log(monkeypatch, setup, sentry) -> None:
    monkeypatch.setattr(settings, "residential_renderer_url", RES_RENDERER)
    _patch(monkeypatch, setup, residential_render=CLEAN)
    await production._acquire_residential(URL)
    assert sentry.errors == []
    (template, kw), = sentry.logs
    assert kw["route"] == "residential" and kw["step"] == "render" and kw["outcome"] == "ok"
    assert kw["host"] == "www.fiordifrolla.it"
    assert kw["attributes"]["fallback"] is True and kw["attributes"]["duration_ms"] >= 0


@pytest.mark.asyncio
@pytest.mark.parametrize("proxy,route", [("socks5://warp:1080", "warp"), ("", "direct")])
async def test_normal_path_logs_route_per_attempt(monkeypatch, setup, sentry, proxy, route) -> None:
    monkeypatch.setattr(settings, "outbound_proxy_url", proxy)

    async def render(_url, renderer_url=None):
        raise RendererFailure("timeout", operational=True)

    async def raw(_url, proxy=None):
        return CLEAN, URL

    monkeypatch.setattr(production, "render_url", render)
    monkeypatch.setattr(production, "_fetch_html", raw)
    await _acquire()
    seen = [(kw["route"], kw["step"], kw["outcome"], kw["attributes"]["fallback"]) for _t, kw in sentry.logs]
    assert seen == [(route, "render", "renderer_timeout", False), (route, "raw", "ok", True)]
    assert sentry.errors == []


def test_init_sentry_enables_logs_only_with_dsn(monkeypatch) -> None:
    from api.services import monitoring

    calls = []
    monkeypatch.setattr(monitoring.sentry_sdk, "init", lambda **kw: calls.append(kw))
    monkeypatch.setattr(monitoring.settings, "sentry_dsn", "")
    monitoring.init_sentry()
    assert calls == []
    monkeypatch.setattr(monitoring.settings, "sentry_dsn", "https://k@example.ingest.sentry.io/1")
    monitoring.init_sentry()
    assert calls[0]["enable_logs"] is True
