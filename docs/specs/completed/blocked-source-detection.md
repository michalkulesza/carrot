# Blocked-source (bot challenge) detection

## Problem
Prod import `ed330282-…` (https://www.fiordifrolla.it/bolzano-apple-cake/) failed with
`invalid_model_response` ("The extraction response was invalid."). Actual cause: SiteGround's
SGCaptcha blocks our WARP egress IP. The renderer returned the "Robot Challenge Screen" page,
the raw fallback got `HTTP 202` with a 190-byte meta-refresh stub to `/.well-known/sgcaptcha/`,
and the extractor threw on that stub. `_extract_html_payload` maps *any* exception to
`INVALID_MODEL_RESPONSE` and logs nothing.

## Goals
1. Detect anti-bot challenge pages and fail with a dedicated, honest code: `source_blocked`.
2. Make `source_blocked` eligible for on-device HTML capture (mobile), whose IP is usually not blocked.
3. Stop swallowing extractor exceptions silently — log them.
4. Let the renderer wait out SGCaptcha the same way it waits out Cloudflare challenges.
5. UI (web + mobile) shows the new message and offers the manual/paste path, in all 5 locales.

## Design

### Backend (services/api)
- `FailureReason.SOURCE_BLOCKED = "SOURCE_BLOCKED"` (extraction_v2/contracts.py) and
  `ImportFailureCode.SOURCE_BLOCKED = "source_blocked"` (models.py). `failure_code` is
  `String(64)` — no migration.
- New `extraction_v2/challenge.py` with `looks_like_bot_challenge(html: str, status_code: int | None = None) -> bool`.
  Specific markers only (no generic "captcha" substring): `sgcaptcha`, `sgchallenge`,
  `<title>Robot Challenge Screen`, `cf-chl-`, `_cf_chl_opt`, `<title>Just a moment...`,
  `Attention Required! | Cloudflare`, `captcha-delivery.com` (DataDome), `px-captcha`
  (PerimeterX), `_Incapsula_Resource`, `sucuri_cloudproxy`. Title-style markers only count when
  the page is small (< 100 KB) to avoid false positives on real articles.
- `production._fetch_html`: on any HTML response (2xx or 202/403/429/503), if the body looks
  like a challenge → raise `SourceBlocked`. Other non-2xx keep `raise_for_status()` behaviour.
- `acquire_and_extract_url`: a rendered page that looks like a challenge is treated as an
  operational renderer failure (`renderer_failure="bot_challenge"`) and falls back to raw fetch.
  If the raw fetch raises `SourceBlocked` (or returns a challenge) → `FailedOutcome(SOURCE_BLOCKED, INPUT)`.
- `orchestrator._extract_html_payload`: if the payload HTML is a challenge (covers device-captured
  HTML too) → `SOURCE_BLOCKED` before calling the extractor.
- Broad `except Exception` blocks in the orchestrator keep their mapping but `logger.warning(..., exc_info=True)`.
- `routes/imports._DEVICE_CAPTURE_FAILURE_CODES` gains `SOURCE_BLOCKED`. A job that already went
  through device capture must not become eligible again (no capture loop).
- `source_blocked` is **not** transient (no automatic retries — the block is IP-based) and is
  **not** in `NON_RECIPE_FAILURE_CODES` (linked child pages stay unresolved, not "external").

### Renderer (services/renderer)
- `CHALLENGE_TITLE` also matches `robot challenge screen`; `CHALLENGE_BODY` also matches
  `sgchallenge|sgcaptcha`, so `waitOutChallenge` gives the JS proof-of-work time to pass.

### UI
- `packages/shared/src/types.ts`: add `"source_blocked"` to `ImportFailureCode`.
- Locales (en, pl, de, fr, es): `importJobs.failure.source_blocked` —
  en: "This website blocked automatic import. Paste the recipe text instead, or try again later."
- Web `ImportJobCards.tsx` and mobile `PendingJobCard.tsx`: treat `source_blocked` like the
  user-action failure codes (card offers the manual/paste continuation + retry). Keep both
  platforms in parity.

## Verification
- pytest: detection helper (positive per vendor marker + the prod stub/challenge HTML, negative
  on a normal recipe page that mentions "captcha" in prose), `_fetch_html` 202/403 challenge →
  `SourceBlocked`, `acquire_and_extract_url` → `source_blocked`, device-capture eligibility,
  orchestrator challenge short-circuit.
- renderer `node --test`.
- web/mobile/shared typecheck + lint; locale key parity.
- After deploy: re-import the fiordifrolla URL; expect `source_blocked` (or success if the
  renderer now passes SGCaptcha), and on mobile an automatic on-device capture.
