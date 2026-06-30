# Background Recipe Import (High-Demand Fallback)

When Gemini is under high demand, recipe extraction can need many retries before
succeeding (observed: **28 retries to success**). Rather than make the user stare
at a spinner, offer to finish the import in the background and notify them when
it's done — even when the app is closed — via an iOS **Live Activity** (Dynamic
Island / lock screen) plus an in-app notification.

This applies to both in-app imports and shares from other apps (Instagram, TikTok, …).

## Decisions made

| Topic | Decision |
|---|---|
| Job ownership | **Server-owned** background job + **remote push**. Only path that works when the app is killed. |
| Review step | **Auto-save the recipe live** (no review gate); user edits later. Tapping "done" opens it in the editor. |
| Processing UI | **Live Activity** (Dynamic Island / lock screen), updated server→device via **direct APNs ActivityKit pushes**. |
| Trigger | **Offered after high demand detected** — on the **first** Gemini 503/429 transient retry. |
| Share-sheet flow | Share still **opens the app**; app runs the import and shows the same offer. Extension unchanged (deep-link). |
| Job runner | **Postgres `import_jobs` table + in-process asyncio worker**. No Redis. Survives restarts (requeue `running` on startup). |
| Retry budget | **Generous** — capped backoff over a long window (target: the 28-retry case succeeds). "Failed" is a last resort. |
| Failure | Live Activity ends as failed + **"tap to retry"** push that reopens import pre-filled with the original input. |
| Completion surfaces | Live Activity end-state + **bell-menu entry** (`recipe_imported` / `recipe_failed`); tap deep-links to the recipe. |
| Push transport | Live Activity updates = **direct APNs** (Expo Push can't drive Live Activities). Fallback alert = raw APNs device token. |

## End-to-end flow

1. User imports a recipe (URL / text / image), in-app or via share sheet → app opens import screen, starts the SSE stream as today.
2. Server hits its **first transient (503/429) Gemini retry** → emits a new `high_demand` stream event.
3. App surfaces: **"High demand — process in background & we'll notify you?"**
4. User accepts:
   - App **starts a Live Activity** locally and obtains its ActivityKit push-to-update token.
   - App calls a new **enqueue-job** endpoint with the original input + the activity push token.
   - App **closes the foreground stream** (abandons the foreground attempt) and dismisses the import screen.
5. Worker claims the job, retries Gemini generously over a long window.
6. **Success:** server auto-saves the recipe live, pushes the Live Activity to its **"Recipe added"** end state, and records a bell-menu entry. Recipe appears in the library via the existing *invalidate-all-queries-on-foreground* behavior.
7. **Failure** (empty extraction or long outage): server ends the Live Activity as **failed** and pushes "Couldn't add recipe — tap to retry"; tapping reopens the import screen pre-filled with the original input.

## Backend

### `import_jobs` table

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `user_id` | FK; completion notifications target this user |
| `status` | `pending` / `running` / `succeeded` / `failed` |
| `kind` | `url` / `text` / `image` |
| `input` | JSON payload (url / text / base64 image + mime) |
| `model` | gemini model id |
| `activity_push_token` | ActivityKit push-to-update token for this device's Live Activity |
| `device_push_token` | raw APNs token, for the fallback completion banner |
| `result_recipe_id` | set on success |
| `error` | set on failure |
| `attempts` | retry counter |
| `created_at` / `updated_at` | |

### Worker

- In-process asyncio loop in the FastAPI process; claims `pending` jobs (`SELECT … FOR UPDATE SKIP LOCKED`).
- On startup, requeue anything left `running` (crash/deploy recovery).
- Reuses the existing `run_*_import` pipeline, but with a **much larger retry budget** than the foreground `_with_retry` — capped exponential backoff retrying for a long window before declaring failure.
- On each meaningful transition, push a Live Activity update via APNs.
- On success: call the same save logic as `POST /recipes` (`save_recipe`) with the extracted recipe + the user's tags/allergens (server already has these via `_get_tags_and_allergens`). Allergen flags attached, substitutions **not** auto-applied (matches current default; user edits later).

### Endpoints

- `POST /imports/jobs` — body: input (url/text/image), model, `activity_push_token`, `device_push_token`. Creates a `pending` job, returns its id.
- `GET /imports/jobs/{id}` — status polling (used if the app is reopened before completion).
- Stream change: emit `{"type": "high_demand"}` from `run_*_import_stream` on the first transient Gemini retry. Thread a callback from `gemini_svc._with_retry` up to the stream generator so it can yield the event.

### APNs

- Server needs an APNs auth key (`.p8`), Key ID, Team ID, bundle id `com.kulesza.platekeeper`.
- Async HTTP/2 APNs client (e.g. `aioapns`) for both `liveactivity` push type (Live Activity updates/end) and `alert` push type (fallback banner).
- Store creds as env / secrets alongside existing API config.

## iOS / mobile

- **New Swift widget extension** with a Live Activity (`ActivityKit`) — states: *processing*, *done*, *failed*. Dynamic Island compact/expanded + lock-screen presentations.
  - It's a native Xcode target → add via an Expo config plugin (e.g. `expo-apple-targets`) and a prebuild. Complicates the managed workflow; document the prebuild step.
- App side:
  - When the user accepts the offer, start the Live Activity, grab `pushTokenUpdates`, send the token with the enqueue request.
  - Add `recipe_imported` / `recipe_failed` to `NotificationItem['type']` in `NotificationHistoryContext`; render them in `BellMenu`; tap deep-links to the recipe (or to import-retry on failure).
- **Fallback** for devices where Live Activities are unsupported (iOS < 16.1) or disabled (`ActivityAuthorizationInfo().areActivitiesEnabled == false`): skip the Live Activity and deliver a plain completion push via the raw APNs device token (`getDevicePushTokenAsync`).

## Open items to resolve during build

1. **APNs setup** — `.p8` key + an async APNs client on the server. Hard dependency; nothing ships without it.
2. **Widget extension in Expo** — native target via config plugin + prebuild.
3. **Device fallback** — banner-only path when Live Activities are unavailable/disabled.
4. **Image jobs** — base64 image payloads stored in the job row (large-ish but acceptable for Postgres).
5. **Translations** — all new strings in en / pl / de / fr / es.

## Out of scope

- Android (no Live Activity equivalent; would use an ongoing foreground-service notification later).
- Multi-device Live Activities — the Live Activity lives on the originating device; other devices just receive the recipe via normal sync.
