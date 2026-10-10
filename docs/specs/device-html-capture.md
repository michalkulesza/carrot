# Device-side HTML capture for blocked recipe pages

Status: implemented, awaiting review

## Problem

Some recipe sites (Cloudflare bot protection, IP reputation) block our VPS renderer and raw fetch.
The URL import job fails as `source_fetch_failed` (or, for the 7 jobs flagged manually on 2026-10-10,
`user_action_required`), and the user has to open the page and continue manually. The page usually
loads fine on the user's phone: real WebKit, residential/mobile IP, existing cookies.

## Goal

On iOS, automatically fetch the blocked page on the device in a hidden native `WKWebView`
(`react-native-webview`, already installed), send its HTML to the API, and let the worker finish the
import from that HTML, with no user action in the common case. Fall back to the existing visible
`webview-import` screen when the page needs interaction (e.g. a Turnstile checkbox).

## Non-goals

- Background capture while the app is closed (iOS does not allow it); capture runs while the app is
  foregrounded.
- Web app (browsers block cross-origin HTML reads; web keeps the current "needs your input" flow).
- Social sources (Instagram/TikTok go through ScrapeCreators, not HTML fetch).
- Safari share-extension JS preprocessing (`NSExtensionJavaScriptPreprocessingFile`) — follow-up, add
  to `docs/TODO.md`.

## Backend

### Eligibility

`ImportJobOut` gains `device_capture_eligible: bool` (shared TS type too), true when:
`kind == url`, `status == failed`, `dismissed_at is None`, the URL host is not social / unsupported
social (reuse `_SOCIAL_SUFFIXES` / `_UNSUPPORTED_SOCIAL_SUFFIXES` from `extraction_v2/production.py`,
expose a small `is_html_source(url)` helper), and `failure_code` in
`{"source_fetch_failed", "user_action_required"}`. The client never hardcodes this rule.

### Endpoint: `POST /imports/jobs/{job_id}/captured-html` (`routes/imports.py`)

Body `{ "html": str, "final_url": str }`; returns `ImportJobOut` (202-style semantics, use 200).
- Auth via `_action_job` (same as retry).
- 409 if the job is not `device_capture_eligible` (so repeated/concurrent posts are harmless: the
  first one flips the job to pending; lock the row with `with_for_update`).
- 413 if `len(html.encode()) > 3 MB`; 422 if html is blank or `final_url` is not http(s). `final_url`
  must have the same registrable host as the job URL (same host, or one is a subdomain of the other);
  otherwise 422.
- Stores `input["captured_html"]` and `input["captured_final_url"]`, then resets the job like
  `retry_import_job` (pending, clear failure fields, `next_attempt_at = now`) and emits the update
  event. Keep `input["url"]` unchanged.

### Worker (`services/import_worker.py`, `extraction_v2/production.py`)

Add `extract_captured_html(url, final_url, html, usage)` in `production.py` that builds the same
`HtmlPayload` as `acquire_and_extract_url` (source_url = final_url) and the same `source_capture`
dict with `render_status = "device_capture"`, appending a trace event `html_device_capture`. Factor the
shared tail of `acquire_and_extract_url` into a helper rather than duplicating it.

In the URL branch of the worker, if `input` has `captured_html`, call `extract_captured_html` instead
of `acquire_and_extract_url`. Drop `captured_html` from `input` once the job reaches a terminal state
(succeeded or failed) so the DB doesn't keep megabytes per job. The HTML is untrusted: it only ever
flows through `clean_html_body` and the extractor (never rendered), and the size cap applies.

If extraction of captured HTML fails because the page is still a challenge page (no recipe content),
the job fails normally (`no_recipe_content` etc.), is no longer device-capture-eligible, and the
existing "needs your input" flow applies.

### Replace an existing recipe in place

`input` may carry `replaces_recipe_id`. When present and that recipe is in the job's household, the
worker updates it in place instead of creating a new recipe: move `_apply_extraction` from
`scripts/reimport_recipes.py` into a service (e.g. `services/recipe_reextraction.py`) and use it from both.
Set `result_recipe_id` to the replaced recipe. Preserve `linked_recipe_ids` the same way the re-import
script will (see [linked-recipes-backfill](linked-recipes-backfill.md)); if that spec has landed, reuse its
helper. After deploy, set `replaces_recipe_id` on the 7 prod jobs flagged on 2026-10-10 (household
`004fd81e-cdc9-4833-8546-e92e1609f01e`, recipes dc47badd…, 37f3185c…, 36188809…, bbbc892f…, 28694dca…,
751a29b1…, b39dc36a…; match by `input.url` = recipe `source_url`) and set their `failure_code` to
`source_fetch_failed`.

## Mobile

### `useDeviceHtmlCapture` + `DeviceHtmlCaptureHost` (`apps/mobile/src/components/DeviceHtmlCapture/`)

Mounted once in the signed-in root layout (`apps/mobile/app/_layout.tsx`).
- Reads the `['importJobs']` React Query cache (already kept fresh via SSE); picks jobs with
  `device_capture_eligible && created_by_user_id === user.id`, one at a time, only while
  `AppState === 'active'`.
- Keeps a session-local `Set` of attempted job ids so each job is tried once per app session
  (a retry by the user clears it for that id).
- Renders a hidden `WebView` (1×1, `opacity: 0`, `pointerEvents="none"`, outside layout flow; this is
  the one justified absolute-positioned element). `cacheEnabled`, no `incognito` (shares cookies with
  the visible import WebView). Same Safari-like UA as the system default (don't override).
- After `onLoadEnd`, inject a script that every 1 s checks for a challenge
  (`/just a moment|attention required|temporary error/i` on `document.title`, or
  `cf-chl-`/`_cf_chl_opt`/`challenge-platform` in the HTML); when clear, posts
  `{ html: document.documentElement.outerHTML, final_url: location.href }` via
  `ReactNativeWebView.postMessage`. Give up after 20 s.
- On success: call `api.submitCapturedHtml(jobId, payload)` (new shared API client method) through
  `useMutation`, update the job in the `['importJobs']` cache with the response. 409 → ignore (another
  device/tap already did it).
- On timeout/challenge: mark the job id as "needs interaction" in a small zustand/React-context store
  (or React Query client state) that `PendingJobCard` reads.
- No visible UI while capturing except that `PendingJobCard` shows the existing running state text
  `importJobs.capturingOnDevice` for the job being captured.

### Visible fallback

- `PendingJobCard`: for eligible jobs, the user-action alert gets an extra first option
  "Open page" (`importJobs.openPageToContinue`) that pushes
  `/webview-import?url=…&jobId=…`.
- `WebViewImportScreen`: when `jobId` is present, the ✓ button captures
  `document.documentElement.outerHTML` + `location.href` (instead of `innerText`) and calls
  `submitCapturedHtml`; on success `router.back()`. Without `jobId` behaviour is unchanged. Guard the ✓
  against repeated taps (already disabled while `extracting`).

### Translations (en, pl, de, fr, es)

`importJobs.capturingOnDevice`, `importJobs.openPageToContinue`, `importJobs.captureFailed`.

## Tests

API (`services/api/tests/`):
- eligibility truth table (kind, status, failure codes, social host, dismissed);
- endpoint: 409 when not eligible, 413 oversize, 422 host mismatch, success flips to pending and keeps
  `input.url`, second call → 409;
- worker: job with `captured_html` never calls the renderer/fetch, produces `render_status
  "device_capture"`, clears `captured_html` afterwards;
- `replaces_recipe_id`: updates in place, no new recipe row, `result_recipe_id` = replaced id.

Mobile: typecheck (`pnpm --filter mobile typecheck` or repo equivalent); the challenge-detect predicate
lives in a pure helper with a unit test if the mobile package has a test runner.

## Rollout

Deploy API first (backwards compatible: new field + endpoint). Then patch the 7 prod jobs. Then ship
the mobile build; open the app and confirm the blocked recipes import on their own.

## Implementation notes

- `general.md` is a broken symlink in the worktree, so only `CLAUDE.md` conventions were followed.
- Eligibility lives in `routes/imports.py::is_device_capture_eligible`; `is_html_source` is in `extraction_v2/production.py` and the shared tail of `acquire_and_extract_url` is now `_extract_html`.
- The endpoint also clears `failure_stage` and `outcome` when flipping the job to pending. Order of checks: 409, 413, 422.
- Worker drops `captured_html` and `captured_final_url` on terminal failure (including household access loss) and on success; transient retries keep them. A `replaces_recipe_id` that is invalid, missing, or not in the household falls back to creating a new recipe.
- `_apply_extraction` moved to `services/recipe_reextraction.apply_extraction`; `carry_over_linked_recipe_ids` there is the minimal local link-preservation (by normalised URL) used only by the worker path, to be reconciled with the linked-recipes-backfill helper. `spawn_linked_imports` still runs for replaced recipes.
- In-place replacement uses the script's `apply_extraction` as-is, so ingredient-punctuation normalisation done by `_save_recipe` is not applied.
- Mobile "needs interaction" and "attempted" state is a small `useSyncExternalStore` module (`DeviceHtmlCapture/store.ts`) because zustand is not installed and the React Query cache is persisted to disk. The challenge predicate and `CAPTURE_REJECTED_DETAIL` live in `packages/shared/src/utils/challengeDetection.ts` (unit-tested with `node --test` since mobile has no test runner); the hidden WebView script interpolates the same regexes.
- Capture aborts (and the job becomes retryable this session) if the app leaves the foreground mid-capture. 409 detection compares the error message with the API detail string.
- The visible `webview-import` screen does not clear the session "attempted" mark after a successful submit, to avoid a capture loop if the job fails again.
- Not done (rollout steps): patching the 7 production jobs.
