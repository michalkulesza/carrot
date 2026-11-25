import asyncio
import logging
from collections.abc import Awaitable, Callable

import httpx
from sentry_sdk.crons import capture_checkin
from sqlalchemy import text

from api.config import settings
from api.database import engine
from api.services.monitoring import report_dependency_down, sentry_enabled

log = logging.getLogger(__name__)

CHECK_TIMEOUT_SECONDS = 10
MONITOR_SLUG = "worker-health-probe"
TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace"
CHECKIN_MARGIN_MINUTES = 5

Check = Callable[[], Awaitable[None]]


class DependencyCheckFailed(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"unexpected status {status_code}")
        self.status_code = status_code


async def _check_database() -> None:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def _get_ok(url: str, *, proxy: str | None = None) -> None:
    async with httpx.AsyncClient(timeout=CHECK_TIMEOUT_SECONDS, proxy=proxy) as client:
        response = await client.get(url)
    if response.status_code != 200:
        raise DependencyCheckFailed(response.status_code)


def _renderer_check(base_url: str) -> Check:
    return lambda: _get_ok(f"{base_url.rstrip('/')}/healthz")


def _proxy_check(proxy_url: str) -> Check:
    return lambda: _get_ok(TRACE_URL, proxy=proxy_url)


def build_checks() -> dict[str, Check]:
    checks: dict[str, Check] = {"database": _check_database}
    if settings.renderer_url:
        checks["renderer"] = _renderer_check(settings.renderer_url)
    if settings.residential_renderer_url:
        checks["renderer_residential"] = _renderer_check(settings.residential_renderer_url)
    if settings.outbound_proxy_url:
        checks["outbound_proxy"] = _proxy_check(settings.outbound_proxy_url)
    if settings.residential_proxy_url:
        checks["residential_proxy"] = _proxy_check(settings.residential_proxy_url)
    return checks


async def _run_check(check: Check) -> Exception | None:
    try:
        await asyncio.wait_for(check(), timeout=CHECK_TIMEOUT_SECONDS)
    except Exception as error:
        return error
    return None


def _report_failure(name: str, error: Exception) -> None:
    status_code = error.status_code if isinstance(error, DependencyCheckFailed) else None
    log.warning("Dependency down: %s (%s)", name, type(error).__name__)
    report_dependency_down(name, status_code=status_code, error=error)


def _send_checkin(*, ok: bool) -> None:
    if not sentry_enabled():
        return
    interval_minutes = max(1, round(settings.health_probe_interval_seconds / 60))
    capture_checkin(
        monitor_slug=MONITOR_SLUG,
        status="ok" if ok else "error",
        monitor_config={
            "schedule": {"type": "interval", "value": interval_minutes, "unit": "minute"},
            "checkin_margin": CHECKIN_MARGIN_MINUTES,
            "failure_issue_threshold": 1,
            "recovery_threshold": 1,
        },
    )


async def run_probe_once(down: set[str]) -> bool:
    checks = build_checks()
    errors = await asyncio.gather(*(_run_check(check) for check in checks.values()))

    for name, error in zip(checks, errors):
        if error is not None:
            down.add(name)
            _report_failure(name, error)
        elif name in down:
            down.discard(name)
            log.info("Dependency recovered: %s", name)

    ok = all(error is None for error in errors)
    _send_checkin(ok=ok)
    return ok


async def run_health_probe() -> None:
    down: set[str] = set()
    while True:
        try:
            await run_probe_once(down)
        except Exception as error:
            log.warning("Health probe run failed: %s", type(error).__name__)
        await asyncio.sleep(settings.health_probe_interval_seconds)
