from __future__ import annotations

import hashlib
import json
import logging
import time
from enum import Enum
from typing import Any

import httpx
import jwt

from api.config import settings
from api.services.monitoring import report_service_failure

log = logging.getLogger(__name__)

_APNS_PROD_HOST = "https://api.push.apple.com"
_APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com"
_JWT_TTL_SECONDS = 50 * 60
_MAX_COLLAPSE_ID_BYTES = 64
_DEAD_TOKEN_REASONS = frozenset({"BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"})

_client: httpx.AsyncClient | None = None
_jwt_cache: tuple[str, float] | None = None


class PushResult(str, Enum):
    SENT = "sent"
    DEAD_TOKEN = "dead_token"
    FAILED = "failed"
    SKIPPED = "skipped"


def _make_jwt() -> str:
    global _jwt_cache
    now = time.time()
    if _jwt_cache is not None and now - _jwt_cache[1] < _JWT_TTL_SECONDS:
        return _jwt_cache[0]
    token = jwt.encode(
        {"iss": settings.apns_team_id, "iat": int(now)},
        settings.apns_key_p8,
        algorithm="ES256",
        headers={"kid": settings.apns_key_id},
    )
    _jwt_cache = (token, now)
    return token


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(http2=True, timeout=10)
    return _client


def header_collapse_id(collapse_id: str) -> str:
    if len(collapse_id.encode()) <= _MAX_COLLAPSE_ID_BYTES:
        return collapse_id
    return hashlib.sha256(collapse_id.encode()).hexdigest()[:32]


def _rejection_reason(resp: httpx.Response) -> str | None:
    try:
        return resp.json().get("reason")
    except ValueError:
        return None


async def _send(
    device_token: str,
    push_type: str,
    topic: str,
    payload: dict[str, Any],
    *,
    priority: int = 10,
    collapse_id: str | None = None,
) -> PushResult:
    if not settings.apns_configured:
        log.debug("APNs not configured — skipping push to %s", device_token[:8])
        return PushResult.SKIPPED
    if not device_token:
        return PushResult.SKIPPED

    host = _APNS_SANDBOX_HOST if settings.apns_sandbox else _APNS_PROD_HOST
    try:
        headers = {
            "authorization": f"bearer {_make_jwt()}",
            "apns-topic": topic,
            "apns-push-type": push_type,
            "apns-priority": str(priority),
        }
        if collapse_id:
            headers["apns-collapse-id"] = header_collapse_id(collapse_id)
        resp = await _get_client().post(
            f"{host}/3/device/{device_token}",
            content=json.dumps(payload).encode(),
            headers=headers,
        )
    except Exception as exc:
        log.warning("APNs push error: %s", type(exc).__name__)
        report_service_failure("push_send", error=exc)
        return PushResult.FAILED

    if resp.status_code in (200, 201):
        return PushResult.SENT
    if resp.status_code == 410 or _rejection_reason(resp) in _DEAD_TOKEN_REASONS:
        return PushResult.DEAD_TOKEN

    log.warning("APNs push failed status=%d", resp.status_code)
    report_service_failure("push_send", status_code=resp.status_code)
    return PushResult.FAILED


async def send_alert(
    device_token: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
    *,
    collapse_id: str | None = None,
    thread_id: str | None = None,
) -> PushResult:
    aps: dict[str, Any] = {"alert": {"title": title, "body": body}, "sound": "default"}
    if thread_id:
        aps["thread-id"] = thread_id
    payload = {"aps": aps, **(data or {})}
    return await _send(device_token, "alert", settings.apns_bundle_id, payload, collapse_id=collapse_id)


async def send_background(device_token: str, data: dict[str, Any]) -> PushResult:
    payload = {"aps": {"content-available": 1}, **data}
    return await _send(device_token, "background", settings.apns_bundle_id, payload, priority=5)
