# Background-First Recipe Imports

## Goal

Send every extraction-based recipe import to the background immediately. After the
server accepts the job, close the import UI, navigate to the Recipes page, and show a
shared placeholder while the job is queued or running. Deliver job changes to web and
mobile through durable events so every member of the target household sees the same
state without polling.

This replaces the foreground skeleton/review flow described by the TODO item:
**“When importing recipe send it to the background straight away.”**

## Decisions

| Topic | Decision |
|---|---|
| Clients | Implement on mobile and web. |
| Import methods | Background URL, shared URL/text, pasted text, camera, and gallery imports. Creating from scratch and linking an existing personal recipe stay unchanged. |
| Navigation | Wait for the enqueue response, then go to the Recipes tab/page and insert the returned job immediately. Do not wait for extraction. |
| Review | Auto-save successful imports. Users edit the saved recipe afterward; there is no import preview/review step. |
| Shared visibility | Household jobs are visible to every member viewing that household. Personal jobs are visible only on the importing user's devices. |
| Realtime transport | Authenticated SSE with an initial snapshot and durable job events. No client polling. |
| Durability | Use a transactional outbox and PostgreSQL-backed event distribution. Do not rely on the current in-memory-only broadcaster. |
| Background notifications | Send APNs notifications to all registered mobile devices belonging to the importer only. Other household members receive foreground SSE updates but no OS notification. Web Push is out of scope. |
| Worker | Run imports in a dedicated worker process/container, not in FastAPI's lifespan. Limit global processing concurrency to three. |
| Queue limit | Permit up to 20 `pending`/`running` jobs per user. Return `429` above that limit. |
| Retry | Retry transient capacity/network failures for up to 30 minutes using exponential backoff capped at 60 seconds with jitter. Permanent input/extraction failures fail immediately. |
| Failure | Show a shared failed card with Retry and Dismiss. Any current household member can retry/dismiss a household job; only the owner can do so for a personal job. |
| Cancellation | Any household member can cancel a household job; only the owner can cancel a personal job. |
| Filters | Hide job placeholders when search, tag filters, or favourites-only filtering is active. Sorting alone does not hide them. |
| Legacy flow | Remove the foreground stream endpoints, high-demand event/fallback, skeleton flow, and associated client code. The app is not in production, so backward compatibility is not required. |
| Legacy jobs | Do not add special migration or backfill behavior for existing import jobs. |

## User experience

### Enqueue

1. The user supplies a URL/text/photo and starts the import.
2. The client creates an idempotency key, disables the action, and calls
   `POST /imports/jobs`.
3. The server validates the target scope and queue limit, stores the job, and writes an
   `import_job.created` outbox event in the same transaction.
4. On success, the client seeds the job into its local query cache, closes the import
   UI, and navigates to Recipes:
   - mobile: dismiss the import screen and select the Recipes tab;
   - web: close `AddRecipeModal` and navigate to `/recipes`.
5. On enqueue failure, remain in the import UI and show a localized retryable error. Do
   not create a phantom placeholder.

### Placeholder states

| State | UI |
|---|---|
| `pending` | “Import will start soon”, import type, importing member, start time, and activity indicator. |
| `running` | “Extracting recipe…”, the same safe metadata, and activity indicator. |
| retry scheduled | A `pending` job with `retry_count > 0` shows “Taking longer than usual…” and its next retry time instead of the initial queue message. |
| `failed` | Safe localized failure category plus Retry and Dismiss actions. Never expose exception text or raw input. |
| `succeeded` | Remove the placeholder, invalidate/refetch recipes, and let the real recipe enter the current sort/filter normally. |
| `cancelled` / dismissed | Remove the placeholder immediately on all subscribed clients. |

Render job cards in a separate section above recipe results. Hide the section whenever
search text, tag filters, or favourites-only filtering is active; keep it visible for
all sort selections.

Do not publish the raw URL, pasted text, image, or internal error in an SSE snapshot,
event, notification, or log. Events may include only job identifiers, scope, status,
kind, safe failure category, creator display name, timestamps, retry metadata, and the
result recipe ID.

### Completion feedback

- Foreground clients receive the event through SSE, update the card, and show localized
  in-app feedback.
- The importer receives an APNs completion/failure notification on registered mobile
  devices when the app is backgrounded or closed.
- Suppress a matching foreground APNs banner by correlating on `job_id`, avoiding
  duplicate SSE and push feedback.
- Tapping a success notification opens the saved recipe. Tapping a failure notification
  opens Recipes with the failed job visible.

## Backend design

### Job model and target snapshot

Extend `ImportJob` so the job contains everything needed to execute against the scope
authorized at enqueue time:

| Field | Purpose |
|---|---|
| `idempotency_key` | Client-generated UUID; unique with `user_id`. A duplicate enqueue returns the existing job. |
| `household_id` | Nullable target captured at enqueue. Never read `user.active_household_id` later in the worker. |
| `created_by_user_id` | Existing `user_id`, made explicit in response/event naming. |
| `created_by_name` | Prefer resolving for output rather than duplicating if membership/user joins are cheap. |
| `shared_to_personal` | Snapshot `share_imports_to_personal` at enqueue for household jobs. |
| `status` | `pending`, `running`, `succeeded`, `failed`, or `cancelled`. |
| `failure_code` | Safe enum for client localization; keep internal diagnostic detail separate. |
| `retry_count` / `next_attempt_at` | Retry scheduling and long-running presentation. |
| `dismissed_at` | Global dismissal of a failed shared card. |
| `result_recipe_id` | Recipe created by the successful transaction. |

Add the appropriate foreign keys and indexes for `(household_id, status)`,
`(user_id, status)`, `next_attempt_at`, and the idempotency constraint. Follow the
project's existing schema-update mechanism; do not introduce a separate migration
framework solely for this feature.

At enqueue, derive the active household through the existing authenticated household
dependency and verify membership. At save time, verify that the importing user is still
a member. If access has been revoked, fail with `household_access_changed`; never fall
back to the personal library.

Fix `_save_recipe` to save into the job's captured `household_id` and apply the captured
`shared_to_personal` value. Continue resolving tags, allergens, and auto-substitution
against the captured scope rather than the user's later active scope.

### API contract

Implement or revise these endpoints:

#### `POST /imports/jobs`

Input:

- `kind`: `url | text | image`
- `input`: validated kind-specific payload
- `idempotency_key`: UUID
- optional model only if model choice remains a supported client concern

The server derives user, target household, and sharing preference. It does not accept a
client-supplied household owner or raw device token. Return the safe job representation.
If the same user/idempotency key is submitted again, return the existing job. Reject the
21st active job with `429` and a stable error code.

#### `GET /imports/jobs/events`

Authenticated SSE stream scoped to the current personal library or active household.
It must:

- send an initial `import_jobs.snapshot` containing undismissed `pending`, `running`,
  and `failed` jobs visible in that scope;
- then emit ordered `import_job.created`, `import_job.running`,
  `import_job.retry_scheduled`, `import_job.succeeded`, `import_job.failed`,
  `import_job.cancelled`, and `import_job.dismissed` events;
- include stable event IDs and support `Last-Event-ID` replay from the durable event
  table;
- send heartbeats and release request-scoped DB sessions before the long-lived loop;
- re-check authentication/scope on reconnect.

Subscribe before finalizing the snapshot watermark, or replay events after the
watermark, so a commit between snapshot creation and live subscription cannot be lost.
When the active household changes, clients close the old stream, clear its job cache,
and subscribe to the new scope.

#### Job actions

- `POST /imports/jobs/{id}/retry`: atomically transitions `failed -> pending`, clears
  terminal metadata, resets the 30-minute retry window, and publishes an event. Reuse
  the stored input without returning it to the caller.
- `POST /imports/jobs/{id}/cancel`: atomically requests/transitions cancellation and
  publishes the terminal event. The worker checks cancellation between stages and
  during retry waits.
- `POST /imports/jobs/{id}/dismiss`: allowed only for failed jobs; globally archives the
  shared card, clears its raw input, and publishes `dismissed`.

For household jobs, authorize actions by current household membership. For personal
jobs, authorize only the owner. Use conditional updates/status checks so simultaneous
retry, cancel, or dismiss requests cannot create duplicate work.

Remove the foreground import/stream routes and the pipeline's `high_demand` event
plumbing once both clients use job enqueueing.

### Transactional outbox and event relay

Add an `import_job_events` outbox/event-log table with event ID, job ID, scope, type,
safe payload, creation time, push-delivery state, attempt count, and next delivery time.

Every externally visible state transition must update the job and insert its event in
one database transaction. Most importantly, save the `Recipe`, mark the job succeeded,
set `result_recipe_id`, and create `import_job.succeeded` atomically. This also closes
the current crash window where a recipe can be committed before the job is marked
successful and then be created twice after recovery.

Run an outbox relay alongside the dedicated worker service:

1. Claim undispatched rows with `FOR UPDATE SKIP LOCKED`.
2. publish their IDs through PostgreSQL `NOTIFY`;
3. let each API process maintain one PostgreSQL listener and fan events out to its local
   SSE subscribers through the existing broadcaster interface;
4. send required APNs notifications independently and retry transient push failures;
5. retire invalid device tokens on permanent APNs responses;
6. mark each delivery channel independently so an APNs failure cannot block SSE.

The event table is the replay source after reconnects, while the job snapshot remains
the authoritative recovery path. Add a bounded retention/cleanup task (seven days is
sufficient once snapshots no longer need an event for recovery).

### Dedicated worker and retry scheduling

Create a distinct worker command/container and remove `import_worker.run()` from the
FastAPI lifespan. Update local and production compose definitions so API and worker use
the same image/configuration and database.

Use three bounded worker loops/tasks. Claim only eligible `pending` jobs whose
`next_attempt_at` is due with `FOR UPDATE SKIP LOCKED`, transition them to `running`, and
write the corresponding event transactionally.

Classify failures rather than matching arbitrary strings at the outermost layer:

- transient: Gemini `429`/`503`, network connection errors, and timeouts;
- permanent: invalid/unsupported input, authorization changes, and confirmed inability
  to extract a recipe;
- unexpected: record diagnostic details server-side and expose a generic safe code.

For transient failures, atomically transition the job back to `pending`, increment
`retry_count`, set `next_attempt_at`, and emit `retry_scheduled`. Use exponential
backoff, jitter, and a 60-second cap until 30 minutes after the job first started. This
releases the worker slot while the delayed job waits; clients distinguish it from a
never-started queued job through `retry_count`. Do not require client retries. Requeue
stale running jobs safely after a worker restart without duplicating a saved recipe.

### Device subscriptions

Replace the per-job `device_push_token` with a durable device-subscription table keyed
by user and installation/device identity. Add authenticated register/update/unregister
endpoints. Mobile registers its native APNs token after notification permission is
available and refreshes it when the token changes or the signed-in user changes.

Completion/failure push fan-out targets every active registered mobile device owned by
the importing user, never every household member. Do not block enqueueing on APNs token
acquisition or notification permission.

### Input retention

- Clear the raw job input in the success transaction.
- Clear it on cancellation or dismissal.
- Retain it for failed jobs so server-side Retry works.
- Purge raw input from undismissed failed jobs after seven days; after purge, Retry is
  unavailable and the card can only be dismissed.
- Never place raw input in outbox events, APNs payloads, client notification history, or
  logs.

## Shared client layer

In `packages/shared`:

- define safe job, snapshot, event, status, failure-code, and action types;
- replace foreground stream helpers with enqueue, subscribe, retry, cancel, dismiss,
  and device-registration clients;
- implement a reusable `useImportJobs` hook backed by React Query;
- seed the cache from enqueue responses, then reduce ordered SSE events into it;
- reconnect SSE with capped backoff and `Last-Event-ID`;
- replace cache state from each authoritative snapshot;
- invalidate `['recipes']` after success before removing the completed placeholder;
- reset/reconnect job state when the authenticated user or active household changes.

Keep the SSE subscription at the authenticated app-shell/provider level rather than
inside the Recipes screen, so state remains current while the user visits another tab.
The screen only decides whether to render the cached cards.

## Mobile changes

- Replace URL/text/image foreground stream starts in `ImportRecipeScreen` with enqueue
  mutations and idempotency keys.
- Preserve create-from-scratch and personal-library linking paths.
- Remove `RecipeImportSkeleton`, `useHighDemandJob`, stream cancellation/result-preview
  state used only by extraction imports, and obsolete translations.
- Retain recipe editing UI only where it is still used for create-from-scratch.
- Replace notification-history-derived pending jobs with `useImportJobs` server state.
- Extend `PendingJobCard` for pending/running/long-running/failed states and native
  Retry, Cancel, and Dismiss actions with accessible labels and haptics.
- Register/unregister APNs device subscriptions at the authenticated application level.
- Route push taps by safe IDs only; remove raw `job_input` retry routes.
- Suppress duplicate foreground completion banners by `job_id` while still recording
  useful notification history.

Follow the native iOS conventions in `~/.claude/CLAUDE.md`, including native alerts or
menus, semantic colors, 44-point targets, and haptics for meaningful actions.

## Web changes

- Replace `AddRecipeModal` foreground stream extraction with enqueue mutations for URL,
  text, and image.
- Preserve create-from-scratch and personal-library linking.
- Remove the extraction skeleton/review state and obsolete streaming callbacks.
- After enqueue, close the modal and navigate to `/recipes`.
- Add the persistent `share_imports_to_personal` preference to web settings and remove
  the post-extraction per-import toggle.
- Render the same safe pending/running/long-running/failed job states above Recipes
  results, with Retry, Cancel, and Dismiss controls.
- Use the shared app-level SSE hook/provider; do not add Web Push in this task.

## Translations

Add every new user-visible string and safe failure message to all five shared locale
files: `en`, `pl`, `de`, `fr`, and `es`. Remove translations that are unused after the
foreground skeleton/high-demand flow is deleted.

At minimum cover queued, running, taking longer, failed categories, retry, cancel,
dismiss, queue full, enqueue failure, completion feedback, importing member metadata,
and accessibility labels.

## Verification

### Backend tests

- Enqueue captures personal/household scope and sharing preference.
- Household membership and personal ownership authorization for snapshot, retry,
  cancel, and dismiss.
- The 20-active-job ceiling and idempotent duplicate enqueue behavior.
- Safe API/event serialization never includes raw input or internal errors.
- Initial snapshot contains only visible undismissed jobs for the requested scope.
- Event ordering, IDs, `Last-Event-ID` replay, reconnect gap recovery, and heartbeat.
- Job transition and outbox insertion are atomic.
- Successful recipe creation, job success, result ID, input clearing, and outbox event
  commit atomically and cannot duplicate after worker restart.
- Three-job worker concurrency, FIFO eligibility, `SKIP LOCKED`, stale recovery, and
  cancellation races.
- Transient retry scheduling/backoff/jitter/30-minute exhaustion and immediate permanent
  failure.
- Membership revocation before save fails without writing to either library.
- Household recipes save to the captured household and honor captured
  `shared_to_personal`; personal jobs remain personal.
- Retry reuses server input without returning it; dismiss/cancel/purge clear input.
- Outbox relay retries channels independently and invalid APNs tokens are retired.
- Device registration is user-scoped and push fan-out targets only the importer.

### Shared/web/mobile tests

- Enqueue seeds a placeholder immediately and navigates only after server success.
- Failed enqueue keeps the import UI open with a localized error.
- Snapshot and every event type reduce to the expected React Query state.
- Household switch/user logout clears the old scope and reconnects correctly.
- Success invalidates recipes and replaces the placeholder with the real recipe.
- Retry, cancel, and dismiss are guarded against repeat taps and update from events.
- Placeholders hide for search/tag/favourite filters but remain under non-default sorts.
- Every import method uses jobs; scratch creation and personal linking are unchanged.
- APNs/SSE correlation avoids duplicate foreground feedback and push taps route safely.
- Translation keys exist in all five locales.
- Typecheck, lint, and relevant unit/integration suites pass for API, shared, web, and
  mobile.

### Manual acceptance scenarios

1. Start an import on mobile and see the placeholder immediately on signed-in web and
   another member's foreground device in the same household.
2. Start an import on web and see mobile update without refreshing.
3. Queue more than three imports: three run, the rest show “Import will start soon”, and
   queued jobs start automatically as slots free up.
4. Force transient Gemini failures and observe automatic retries plus “Taking longer
   than usual…” before eventual success.
5. Background/close the importer's mobile app and receive a completion notification on
   each registered importer device, but not on another member's device.
6. Switch households while a job runs: the placeholder follows its captured household
   and does not leak into another scope.
7. Activate each recipe filter and confirm placeholders hide; change only sorting and
   confirm they remain.
8. Retry, cancel, and dismiss from a second household member and see all foreground
   clients converge through events.
9. Restart API and worker during queued/running work and confirm snapshot/replay recovery
   without duplicate recipes.
10. Verify success/cancel/dismiss clear sensitive input and no event, notification, or
    log contains it.

## Implementation sequence

1. Extend database models for scoped/idempotent jobs, device subscriptions, and the
   event outbox; add safe response/event schemas.
2. Refactor recipe saving into one reusable transaction that honors captured scope and
   can atomically finish a job.
3. Implement enqueue and job-action endpoints with authorization, idempotency, queue
   limits, retention, and outbox writes.
4. Build the dedicated bounded worker, retry classifier/scheduler, cancellation checks,
   stale recovery, and compose service.
5. Implement the outbox relay, PostgreSQL event listener, authenticated SSE snapshot /
   replay endpoint, and APNs device registry/fan-out.
6. Add shared types, API methods, the SSE reducer/provider, and React Query integration.
7. Convert mobile import methods and placeholders; add device registration and push
   correlation; preserve scratch/link flows.
8. Convert web imports and placeholders; add the persistent sharing preference.
9. Remove foreground stream/high-demand backend and client code, then clean unused
   translations and dependencies.
10. Add automated coverage, run all checks, and execute the cross-client manual
    scenarios before moving this plan to `docs/specs/completed/`.

## Out of scope

- Editable review before a background import is saved.
- Web Push notifications while the browser is closed.
- Live Activities/Dynamic Island work beyond any code removed with the old high-demand
  design.
- Special migration behavior for existing import-job rows.
- Changes to create-from-scratch recipes or linking existing personal recipes.
