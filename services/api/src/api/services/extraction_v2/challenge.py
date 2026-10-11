"""Detection of anti-bot challenge pages returned instead of the real document."""

from __future__ import annotations

import re

_SMALL_PAGE_CHARS = 100_000
_VENDOR_MARKERS = re.compile(
    r"sgcaptcha|sgchallenge|cf-chl-|_cf_chl_opt|captcha-delivery\.com|px-captcha|_Incapsula_Resource|sucuri_cloudproxy",
    re.IGNORECASE,
)
_CHALLENGE_TITLES = re.compile(
    r"<title>\s*(?:Robot Challenge Screen|Just a moment\.\.\.|Attention Required! \| Cloudflare)", re.IGNORECASE,
)


def looks_like_bot_challenge(html: str) -> bool:
    # Challenge pages are tiny; real articles that merely mention a vendor stay out of scope.
    if not html or len(html) >= _SMALL_PAGE_CHARS:
        return False
    return bool(_VENDOR_MARKERS.search(html) or _CHALLENGE_TITLES.search(html))
