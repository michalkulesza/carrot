from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx
import jwt

from api.config import settings

log = logging.getLogger(__name__)

_APNS_PROD_HOST = "https://api.push.apple.com"
_APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com"


def _make_jwt() -> str:
    payload = {"iss": settings.apns_team_id, "iat": int(time.time())}
    return jwt.encode(
        payload,
        settings.apns_key_p8,
        algorithm="ES256",
        headers={"kid": settings.apns_key_id},
    )


async def _send(
    device_token: str,
    push_type: str,
    topic: str,
    payload: dict[str, Any],
) -> None:
    if not settings.apns_configured:
        log.debug("APNs not configured — skipping push to %s", device_token[:8])
        return
    if not device_token:
        return

    host = _APNS_SANDBOX_HOST if settings.apns_sandbox else _APNS_PROD_HOST
    token = _make_jwt()
    headers = {
        "authorization": f"bearer {token}",
        "apns-topic": topic,
        "apns-push-type": push_type,
        "apns-priority": "10",
    }

    try:
        async with httpx.AsyncClient(http2=True, timeout=10) as client:
            resp = await client.post(
                f"{host}/3/device/{device_token}",
                content=json.dumps(payload).encode(),
                headers=headers,
            )
        if resp.status_code not in (200, 201):
            log.warning("APNs push failed status=%d body=%s", resp.status_code, resp.text[:200])
    except Exception as exc:
        log.warning("APNs push error: %s", exc)


async def send_alert(
    device_token: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> None:
    """Send a standard alert push (fallback completion banner)."""
    payload: dict[str, Any] = {
        "aps": {
            "alert": {"title": title, "body": body},
            "sound": "default",
        },
        **(data or {}),
    }
    await _send(device_token, "alert", settings.apns_bundle_id, payload)
