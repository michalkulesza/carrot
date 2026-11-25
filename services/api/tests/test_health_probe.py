import httpx
import pytest

from api.services import health_probe


@pytest.fixture
def reports(monkeypatch):
    calls = []
    monkeypatch.setattr(health_probe, "report_dependency_down", lambda name, **kw: calls.append((name, kw)))
    return calls


@pytest.fixture
def checkins(monkeypatch):
    calls = []
    monkeypatch.setattr(health_probe, "capture_checkin", lambda **kw: calls.append(kw))
    return calls


def _use_checks(monkeypatch, checks):
    monkeypatch.setattr(health_probe, "build_checks", lambda: checks)


async def _ok():
    return None


def _failing(error):
    async def check():
        raise error
    return check


def test_build_checks_skips_unconfigured(monkeypatch):
    settings = health_probe.settings
    monkeypatch.setattr(settings, "renderer_url", "")
    monkeypatch.setattr(settings, "residential_renderer_url", "")
    monkeypatch.setattr(settings, "outbound_proxy_url", "")
    monkeypatch.setattr(settings, "residential_proxy_url", "")
    assert list(health_probe.build_checks()) == ["database"]

    monkeypatch.setattr(settings, "renderer_url", "http://renderer:8080")
    monkeypatch.setattr(settings, "residential_renderer_url", "http://res:8080")
    monkeypatch.setattr(settings, "outbound_proxy_url", "socks5://warp:1080")
    monkeypatch.setattr(settings, "residential_proxy_url", "socks5h://pi:40002")
    assert list(health_probe.build_checks()) == [
        "database", "renderer", "renderer_residential", "outbound_proxy", "residential_proxy",
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("status,ok", [(200, True), (503, False)])
async def test_renderer_check_requires_200(monkeypatch, status, ok):
    seen = []
    client_class = httpx.AsyncClient

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(status)

    monkeypatch.setattr(
        health_probe.httpx, "AsyncClient",
        lambda **kw: client_class(transport=httpx.MockTransport(handler), **{**kw, "proxy": None}),
    )
    check = health_probe._renderer_check("http://renderer:8080/")
    if ok:
        await check()
    else:
        with pytest.raises(health_probe.DependencyCheckFailed) as failed:
            await check()
        assert failed.value.status_code == status
    assert seen == ["http://renderer:8080/healthz"]


@pytest.mark.asyncio
async def test_proxy_check_fetches_trace_through_proxy(monkeypatch):
    seen = []
    client_class = httpx.AsyncClient

    def factory(**kw):
        seen.append(kw["proxy"])
        return client_class(transport=httpx.MockTransport(lambda r: httpx.Response(200)), **{**kw, "proxy": None})

    monkeypatch.setattr(health_probe.httpx, "AsyncClient", factory)
    await health_probe._proxy_check("socks5h://pi:40002")()
    assert seen == ["socks5h://pi:40002"]


@pytest.mark.asyncio
async def test_failure_reports_dependency_and_other_checks_still_run(monkeypatch, reports, checkins):
    ran = []

    async def second():
        ran.append("second")

    _use_checks(monkeypatch, {
        "database": _failing(RuntimeError("boom")),
        "renderer": second,
        "outbound_proxy": _failing(health_probe.DependencyCheckFailed(502)),
    })
    monkeypatch.setattr(health_probe, "sentry_enabled", lambda: True)
    down = set()

    ok = await health_probe.run_probe_once(down)

    assert ok is False and ran == ["second"]
    assert reports == [
        ("database", {"status_code": None, "error": reports[0][1]["error"]}),
        ("outbound_proxy", {"status_code": 502, "error": reports[1][1]["error"]}),
    ]
    assert isinstance(reports[0][1]["error"], RuntimeError)
    assert down == {"database", "outbound_proxy"}
    assert checkins[0]["status"] == "error" and checkins[0]["monitor_slug"] == "worker-health-probe"


@pytest.mark.asyncio
async def test_timeout_counts_as_failure(monkeypatch, reports, checkins):
    async def hang():
        import asyncio
        await asyncio.sleep(5)

    monkeypatch.setattr(health_probe, "CHECK_TIMEOUT_SECONDS", 0.01)
    _use_checks(monkeypatch, {"renderer": hang})

    assert await health_probe.run_probe_once(set()) is False
    assert reports[0][0] == "renderer"


@pytest.mark.asyncio
async def test_success_sends_ok_checkin_with_monitor_config_and_logs_recovery(monkeypatch, reports, checkins, caplog):
    _use_checks(monkeypatch, {"database": _ok})
    monkeypatch.setattr(health_probe, "sentry_enabled", lambda: True)
    monkeypatch.setattr(health_probe.settings, "health_probe_interval_seconds", 300)
    down = {"database"}

    with caplog.at_level("INFO", logger=health_probe.log.name):
        assert await health_probe.run_probe_once(down) is True

    assert reports == [] and down == set()
    assert "Dependency recovered: database" in caplog.text
    assert checkins[0]["status"] == "ok"
    assert checkins[0]["monitor_config"] == {
        "schedule": {"type": "interval", "value": 5, "unit": "minute"},
        "checkin_margin": 5,
        "failure_issue_threshold": 1,
        "recovery_threshold": 1,
    }


@pytest.mark.asyncio
async def test_no_checkin_outside_production(monkeypatch, reports, checkins):
    _use_checks(monkeypatch, {"database": _ok})
    monkeypatch.setattr(health_probe.settings, "sentry_environment", "development")

    await health_probe.run_probe_once(set())

    assert checkins == []


@pytest.mark.asyncio
async def test_failure_outside_production_logs_dev_line_only(monkeypatch, caplog, checkins):
    _use_checks(monkeypatch, {"renderer": _failing(RuntimeError("x"))})
    monkeypatch.setattr(health_probe.settings, "sentry_environment", "development")

    with caplog.at_level("WARNING"):
        await health_probe.run_probe_once(set())

    assert "[SENTRY:DEV] Dependency down: renderer" in caplog.text
    assert "['dependency_down', 'renderer']" in caplog.text
    assert checkins == []


@pytest.mark.asyncio
async def test_loop_survives_a_crashing_run(monkeypatch):
    import asyncio

    runs = []

    async def run_once(_down):
        runs.append(1)
        raise RuntimeError("boom")

    monkeypatch.setattr(health_probe, "run_probe_once", run_once)
    monkeypatch.setattr(health_probe.settings, "health_probe_interval_seconds", 0)
    task = asyncio.create_task(health_probe.run_health_probe())
    await asyncio.sleep(0.05)
    task.cancel()

    assert len(runs) > 1
