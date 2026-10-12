"""Anti-bot challenge detection (SGCaptcha, Cloudflare, ...) and the source_blocked failure."""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest

from api.models import ImportFailureCode, ImportJob, ImportJobKind, ImportJobStatus
from api.routes import imports as imports_routes
from api.services import gemini, import_worker
from api.services.extraction_v2 import production
from api.services.extraction_v2.challenge import looks_like_bot_challenge
from api.services.extraction_v2.contracts import Capture, FailedOutcome, FailureReason, HtmlPayload
from api.services.extraction_v2.orchestrator import ExtractionDependencies, ExtractionOrchestrator
from api.services.html_renderer import RenderedPage, RendererFailure
from api.services.linked_recipes import NON_RECIPE_FAILURE_CODES

URL = "https://www.fiordifrolla.it/bolzano-apple-cake/"
SG_STUB = (
    '<html><head><link rel="icon" href="data:;"><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/'
    '?r=%2Fbolzano-apple-cake%2F&y=ipc:104.28.225.117:1791752662.011"></meta></head></html>'
)
SG_PAGE = (
    '<html><head><title>Robot Challenge Screen</title></head><body><script>const sgchallenge="abc"; '
    'const sgsubmit_url="/.well-known/sgcaptcha/?r=%2Fbolzano-apple-cake%2F";</script></body></html>'
)


@pytest.mark.parametrize("html", [
    SG_STUB, SG_PAGE,
    "<html><head><title>Just a moment...</title></head></html>",
    "<html><title>Attention Required! | Cloudflare</title></html>",
    "<script>window._cf_chl_opt = {}</script>", '<form id="cf-chl-form"></form>',
    '<iframe src="https://geo.captcha-delivery.com/captcha/"></iframe>',
    '<div id="px-captcha"></div>',
    '<script src="/_Incapsula_Resource?SWJIYLWA=1"></script>',
    '<script>sucuri_cloudproxy_js=""</script>',
])
def test_challenge_pages_are_detected(html) -> None:
    assert looks_like_bot_challenge(html)


def test_normal_recipe_page_is_not_a_challenge() -> None:
    html = ("<html><head><title>Apple cake</title></head><body><h1>Apple cake</h1>"
            "<p>Leave the captcha at the door and just a moment of patience: peel the apples.</p>"
            "<li>3 apples</li></body></html>")
    assert not looks_like_bot_challenge(html)
    assert not looks_like_bot_challenge("")


def test_challenge_markers_ignored_on_large_pages() -> None:
    assert not looks_like_bot_challenge("<title>Just a moment...</title>" + "x" * 200_000)


async def _safe(_url):
    return True


def _mock_fetch(monkeypatch, status, body, content_type="text/html; charset=utf-8"):
    real = httpx.AsyncClient
    monkeypatch.setattr(production.httpx, "AsyncClient", lambda **kw: real(
        transport=httpx.MockTransport(lambda _r: httpx.Response(status, headers={"content-type": content_type}, text=body)), **kw))
    monkeypatch.setattr(production, "is_safe_public_destination", _safe)


@pytest.mark.asyncio
@pytest.mark.parametrize("status,body", [(202, SG_STUB), (403, SG_PAGE), (200, SG_PAGE), (503, "<title>Just a moment...</title>")])
async def test_fetch_html_raises_source_blocked_on_challenge(monkeypatch, status, body) -> None:
    _mock_fetch(monkeypatch, status, body)
    with pytest.raises(production.SourceBlocked):
        await production._fetch_html(URL)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [403, 404])
async def test_fetch_html_keeps_status_error_for_ordinary_failures(monkeypatch, status) -> None:
    _mock_fetch(monkeypatch, status, "<html><body>Nope</body></html>")
    with pytest.raises(httpx.HTTPStatusError):
        await production._fetch_html(URL)


@pytest.mark.asyncio
@pytest.mark.parametrize("rendered_html", [SG_PAGE, None])
async def test_acquire_returns_source_blocked(monkeypatch, rendered_html) -> None:
    async def render(_url):
        if rendered_html is None:
            raise RendererFailure("timeout", operational=True)
        return RenderedPage(URL, URL, rendered_html, 100)

    async def raw(_url):
        raise production.SourceBlocked("challenge")

    monkeypatch.setattr(production, "render_url", render)
    monkeypatch.setattr(production, "_fetch_html", raw)
    monkeypatch.setattr(production, "is_safe_public_destination", _safe)

    outcome, _metadata, capture = await production.acquire_and_extract_url(URL, gemini.UsageTracker())

    assert isinstance(outcome, FailedOutcome) and outcome.reason == FailureReason.SOURCE_BLOCKED
    assert capture == {}


@pytest.mark.asyncio
async def test_acquire_falls_back_to_raw_when_render_is_challenge_but_raw_is_clean(monkeypatch) -> None:
    async def render(_url):
        return RenderedPage(URL, URL, SG_PAGE, 100)

    async def raw(_url):
        return "<html><body>recipe</body></html>", URL

    async def extract(payload):
        assert "recipe" in payload["html"]
        return FailedOutcome(outcome="failed", source_url=URL, evidence=[], trace=[],
                             reason=FailureReason.NO_RECIPE_CONTENT, failed_stage="text")

    monkeypatch.setattr(production, "render_url", render)
    monkeypatch.setattr(production, "_fetch_html", raw)
    monkeypatch.setattr(production, "is_safe_public_destination", _safe)
    monkeypatch.setattr(production, "create_production_orchestrator", lambda _u: SimpleNamespace(extract=extract))

    _outcome, _m, capture = await production.acquire_and_extract_url(URL, gemini.UsageTracker())

    assert capture["render_status"] == "raw_fallback" and capture["renderer_failure"] == "bot_challenge"


@pytest.mark.asyncio
async def test_orchestrator_short_circuits_on_challenge_html() -> None:
    extractor = SimpleNamespace(extract_html=AsyncMock(side_effect=AssertionError("must not extract")))
    orchestrator = ExtractionOrchestrator(ExtractionDependencies(extractor=extractor, language_detector=SimpleNamespace()))
    payload = HtmlPayload(schema_version=1, kind="html", source_url=URL, capture=Capture(status="complete"), html=SG_STUB)

    outcome = await orchestrator.extract(payload.model_dump(mode="json"))

    assert isinstance(outcome, FailedOutcome) and outcome.reason == FailureReason.SOURCE_BLOCKED
    extractor.extract_html.assert_not_awaited()


def _job(**overrides) -> ImportJob:
    values = dict(
        id=uuid4(), kind=ImportJobKind.URL, status=ImportJobStatus.FAILED, failure_code=ImportFailureCode.SOURCE_BLOCKED,
        input={"url": URL}, dismissed_at=None, user_id=uuid4(), household_id=uuid4(), idempotency_key=str(uuid4()),
        retry_count=0, created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    values.update(overrides)
    return ImportJob(**values)


def test_source_blocked_is_not_device_capture_eligible() -> None:
    assert imports_routes.is_device_capture_eligible(_job()) is False
    assert imports_routes.is_device_capture_eligible(_job(failure_code=ImportFailureCode.SOURCE_FETCH_FAILED)) is True
    assert imports_routes.is_device_capture_eligible(
        _job(failure_code=ImportFailureCode.SOURCE_FETCH_FAILED, input={"url": URL, "device_capture_used": True})) is False


@pytest.mark.asyncio
async def test_blocked_capture_does_not_become_eligible_again(monkeypatch) -> None:
    job = _job(failure_code=ImportFailureCode.SOURCE_FETCH_FAILED)
    monkeypatch.setattr(imports_routes, "_action_job", AsyncMock(return_value=job))
    monkeypatch.setattr(imports_routes, "_event_for_job", AsyncMock())
    monkeypatch.setattr(imports_routes, "_creator_name", AsyncMock(return_value="Ann"))
    body = imports_routes.CapturedHtmlSubmit(html="<html>x</html>", final_url=URL)
    await imports_routes.submit_captured_html(job.id, body, SimpleNamespace(id=job.user_id), SimpleNamespace(commit=AsyncMock()))
    assert job.input["device_capture_used"] is True

    # the captured page was itself a challenge: the worker fails it as source_blocked and drops the HTML
    job.status = ImportJobStatus.RUNNING
    session = SimpleNamespace(scalar=AsyncMock(return_value=job), commit=AsyncMock())

    class Ctx:
        async def __aenter__(self):
            return session

        async def __aexit__(self, *_):
            return False
    monkeypatch.setattr(import_worker, "async_session_maker", lambda: Ctx())
    monkeypatch.setattr(import_worker, "_event_for_job", AsyncMock())
    monkeypatch.setattr(import_worker, "report_recipe_import_failure", lambda **_k: None)
    await import_worker._fail_or_retry(job.id, import_worker.ImportPipelineFailure("source_blocked", "input"))

    assert job.status == ImportJobStatus.FAILED and job.failure_code == ImportFailureCode.SOURCE_BLOCKED
    assert "captured_html" not in job.input
    assert imports_routes.is_device_capture_eligible(job) is False


def test_source_blocked_is_terminal_and_not_a_non_recipe_page() -> None:
    assert not import_worker._is_transient(import_worker.ImportPipelineFailure("source_blocked", "input"))
    assert ImportFailureCode.SOURCE_BLOCKED not in NON_RECIPE_FAILURE_CODES
