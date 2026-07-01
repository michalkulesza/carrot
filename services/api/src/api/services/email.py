from __future__ import annotations

import logging

import httpx

from api.config import settings

log = logging.getLogger(__name__)

_RESEND_URL = "https://api.resend.com/emails"


async def send_email(to: str, subject: str, html: str, text: str) -> None:
    if not settings.email_configured:
        log.info("EMAIL (console fallback) to=%s subject=%r\n%s", to, subject, text)
        return

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                _RESEND_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={"from": settings.email_from, "to": [to], "subject": subject, "html": html, "text": text},
            )
        if resp.status_code not in (200, 201):
            log.warning("Resend failed status=%d body=%s", resp.status_code, resp.text[:200])
    except Exception as exc:
        log.warning("Email send error: %s", exc)


async def send_verification_code(to: str, code: str) -> None:
    subject = "Your PlateKeeper verification code"
    text = f"Your verification code is: {code}\n\nIt expires in 15 minutes."
    html = f"""
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#1c1c1e">
  <h2 style="font-size:22px;margin-bottom:8px">Verify your email</h2>
  <p style="color:#6e6e73;font-size:16px;margin-bottom:24px">
    Enter this code in the PlateKeeper app to activate your account.
    It expires in 15&nbsp;minutes.
  </p>
  <div style="font-size:36px;font-weight:700;letter-spacing:12px;text-align:center;
              background:#f2f2f7;border-radius:12px;padding:24px 0;margin-bottom:24px">
    {code}
  </div>
  <p style="color:#aeaeb2;font-size:13px">
    If you didn't create a PlateKeeper account, you can safely ignore this email.
  </p>
</body>
</html>"""
    await send_email(to, subject, html, text)


async def send_household_invitation(to: str, household_name: str, inviter: str) -> None:
    subject = f"{inviter} invited you to join {household_name} on PlateKeeper"
    text = (
        f"{inviter} has invited you to join the household '{household_name}' on PlateKeeper.\n\n"
        "Open the PlateKeeper app to see your invitation."
    )
    html = f"""
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#1c1c1e">
  <h2 style="font-size:22px;margin-bottom:8px">You're invited!</h2>
  <p style="font-size:16px;color:#6e6e73;margin-bottom:24px">
    <strong>{inviter}</strong> has invited you to join
    <strong>{household_name}</strong> on PlateKeeper — a shared recipe library.
  </p>
  <p style="font-size:16px">Open the PlateKeeper app to accept or decline the invitation.</p>
  <p style="color:#aeaeb2;font-size:13px;margin-top:32px">
    If you don't have the app yet, download it and create a free account.
    Your invitation will be waiting when you sign up with this email address.
  </p>
</body>
</html>"""
    await send_email(to, subject, html, text)
