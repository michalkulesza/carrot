# Backend monitoring: prod-only Sentry, dependency health probe, egress-unavailable reason

## Why
The home residential proxy (Pi over WireGuard, `:40002` on the VPS docker bridge) went down. Imports failed
as `SOURCE_BLOCKED` ("this site blocks automatic imports"), which blamed the site, and nobody was notified
because failures were only reported when an import happened to fall back to residential. Dev/test runs
also send events into the production Sentry project, mixing noise into real issues.

## Scope (backend: `services/api`, plus FE label + locales)

### 1. Sentry only in production; dev logs to console
- In `services/api/src/api/services/monitoring.py`, add one private emit function that every `report_*`
  helper goes through (`report_service_failure`, `report_residential_failure`, `report_recipe_import_failure`,
  `report_missing_critical_fields`, plus the new ones below). It takes level, message, tags, contexts,
  fingerprint, user/job identity and an optional exception.
  - When `settings.sentry_environment == "production"` and `settings.sentry_dsn` is set, it sends to Sentry
    exactly as today (same tags, contexts, fingerprints; `capture_exception` when an error is given).
  - Otherwise it logs through the stdlib `logging` module at the matching level (`error`/`warning`), with a clear prefix
    such as `[SENTRY:DEV] Residential egress unavailable` followed by the tags, fingerprint and context dict;
    with `exc_info` when an exception is given. It must be obvious in console that this would have been a
    Sentry event.
- `init_sentry()` only initializes the SDK in production (DSN set and environment `production`). That keeps
  unhandled exceptions and `sentry_sdk.logger` calls from dev/pytest out of Sentry; in dev those already
  print to the console via uvicorn/logging.
- Find any other direct `sentry_sdk.capture_*` call in `services/api/src` outside `monitoring.py` and route it
  through the wrapper.
- Keep the existing redaction rules (no URLs beyond origin/path, no user content, no provider bodies).

### 2. Dependency health probe in the worker
- New module `services/api/src/api/services/health_probe.py`, started as a background asyncio task from the
  worker (`api/worker.py` / `import_worker.run`), every `settings.health_probe_interval_seconds` (default 300).
  It must never crash the worker; each check has its own timeout (~10s) and exception handling.
- Checks (skip any whose config is empty):
  - `database`: `SELECT 1`.
  - `renderer`: `GET {renderer_url}/healthz` is 200.
  - `renderer_residential`: `GET {residential_renderer_url}/healthz` is 200.
  - `outbound_proxy` (WARP): fetch `https://www.cloudflare.com/cdn-cgi/trace` through `outbound_proxy_url`.
  - `residential_proxy` (home Pi tunnel): same fetch through `residential_proxy_url`.
  No Gemini or R2 checks.
- Each failed check reports through the wrapper: message `Dependency down: <name>`, level error,
  tag `dependency=<name>`, fingerprint `["dependency_down", name]`, context with error type / status code only.
  Report on every failed run (event count shows outage duration). Log an info line when a dependency recovers.
- Sentry Cron heartbeat (production only, via the same prod gate): after each run call
  `sentry_sdk.crons.capture_checkin(monitor_slug="worker-health-probe", status=ok|error, monitor_config=...)`
  with an interval schedule matching the probe interval, a few minutes `checkin_margin`, and
  `failure_issue_threshold=1`, `recovery_threshold=1`. `error` if any check failed. A dead/hung worker then
  shows up as missed check-ins.

### 3. New failure reason: `EGRESS_UNAVAILABLE`
- Add `EGRESS_UNAVAILABLE` to `FailureReason` (`extraction_v2/contracts.py`) and wherever reasons are
  persisted/serialized (check the DB column/enum and API schemas; lowercase form `egress_unavailable`).
- In `extraction_v2/production.py::_acquire_residential`, when the residential path failed because it was
  **unreachable** (the cases that call `_report_unavailable`, and nothing later succeeded or got a real
  block), raise a distinct exception (e.g. `EgressUnavailable`) instead of `SourceBlocked`.
  `acquire_and_extract_url` maps it to `FailureReason.EGRESS_UNAVAILABLE` (keep the `residential_*` trace event).
  A genuine block (residential reached the site and still got challenged) stays `SOURCE_BLOCKED`.
- Make sure import failure reporting / job persistence / retry logic treat it sensibly (it is our outage,
  so it should be retryable like `SOURCE_FETCH_FAILED`, not a terminal user-input error).
- Update `tests/test_residential_egress.py` (`test_still_blocked_or_tunnel_down_is_source_blocked` splits
  into blocked vs tunnel-down) and any other affected tests.

### 4. Frontend label
- Add `egress_unavailable` to the reason union in `packages/shared/src/types.ts`.
- Add the label to all 7 locales (en, pl, de, fr, es, it, pt) next to `source_blocked`. English:
  "We've run into a problem on our side. Please try again in a little while." Don't mention proxies.
- Check web (`apps/web/src/pages/RecipesPage/helpers.ts` reason sets) and mobile for reason lists or switch
  statements and handle the new value (retryable, not "paste the text instead").

### Tests
- monitoring: prod gate sends to Sentry; non-prod logs `[SENTRY:DEV]` and sends nothing; `init_sentry` is a
  no-op outside production.
- health probe: each check pass/fail, failure reports `Dependency down: <name>` with the fingerprint, an
  exception in one check doesn't stop the others, check-in status ok/error, nothing sent outside production.
- residential: tunnel down → `EGRESS_UNAVAILABLE`; still blocked → `SOURCE_BLOCKED`.
- Run the full API test suite and the TS typecheck for shared/web/mobile.

## Out of scope / done manually
- New Sentry project `carrot-api` and swapping `SENTRY_DSN` in `/opt/carrot/.env` (user).
- Alert rules (user).
- Sentry Uptime monitor on `https://app.carrot.xcxz.xyz/api/healthz` (set up via Sentry, not code).
