# Replace in-app notifications with phone push (+ stale-push removal, Live Activity timers)

## Context
Notifications are duplicated today: import success/failure arrive as an APNs push **and** as an item in the
in-app bell (a client-only history in AsyncStorage/localStorage, `NotificationHistoryContext`). The bell also
hosts running-timer controls, household invitations and "member left" notices. Goal:
- Remove the bell and its history on mobile and web; the phone notification centre is the only notification inbox.
- Turn household invitation and member-left into real pushes.
- Remove outdated pushes from the phone (e.g. "import failed" disappears once a retry succeeds), even when the app is closed.
- Timers move to an iOS Live Activity (lock screen + Dynamic Island) with pause/resume/cancel.
- Invitations get a native home: badge on the Settings tab + Invitations rows in Settings → Household (Accept/Decline via `Alert.alert`). Web mirrors this.

This plan is copied to `docs/specs/notifications-to-push.md` as the first implementation step and committed with the work.

## Decisions (from user)
- Collapse-id + silent background push for removal (needs `remote-notification` background mode → native rebuild).
- New pushes: household invitation, member left. Imports still only to the job creator.
- Live Activity in scope (iOS 16.4 target already; interactive buttons iOS 17+, older iOS gets display-only).
- Web mirrors mobile: no bell; invitations in Settings with nav badge.

## Phase 1 — Backend push layer (`services/api/src/api/`)
1. **`services/apns.py`**
   - `send_alert(..., collapse_id: str | None, thread_id: str | None)` → set `apns-collapse-id` header and `aps.thread-id`.
   - New `send_background(token, data)`: `apns-push-type: background`, `apns-priority: 5`, payload `{"aps": {"content-available": 1}, **data}`.
   - Return a status so callers can delete tokens on `410` / `BadDeviceToken` / `Unregistered`.
   - Reuse one httpx client + cache the JWT (~50 min) instead of rebuilding per send.
2. **New `services/push.py`** (shared sender, moved out of `import_worker`):
   - `notify_user(db, user_id, *, kind, title_key, body_key, params, data, collapse_id)` → looks up `DeviceSubscription` rows, sends, prunes dead tokens.
   - `retract(db, user_id, *, collapse_id)` → background push `{"type": "retract", "collapse_id": ...}`.
   - Localise title/body server-side from the user's `UserPreferences.language` using a small `PUSH_STRINGS` dict (en/pl/de/fr/es/it/pt) — replaces the hard-coded English at `import_worker.py:761-765`.
3. **Collapse-id scheme** (also the client's removal key, sent in `data.collapse_id`):
   `import:<job_id>`, `invite:<invitation_id>`, `left:<household_id>:<left_user_id>`.
4. **Imports** (`services/import_worker.py` `_deliver_pushes`, 744-774):
   - `succeeded` / `failed` → alert with `collapse_id=import:<job_id>` (success replaces the failed banner in place).
   - `created` (manual retry / import-anyway / captured-html re-enqueue a job that previously failed), `dismissed`, `cancelled` → `retract(import:<job_id>)`. Only for jobs that had a prior `failed` push (check existing `push_dispatched_at` on a `failed` event for that job) to avoid noise.
   - Keep skipping linked-recipe child jobs. Only mark `push_dispatched_at` on success; use `push_attempt_count`/`next_push_attempt_at` for a bounded retry (3 attempts) instead of marking failed sends as dispatched.
5. **Invitations** (`routes/households.py`):
   - On create (≈630/649) → push to invitee if they have an account (`collapse_id=invite:<id>`, data `{type:"household_invitation", invitation_id}`).
   - Email invites claimed at sign-up (`services/invitations.py:10`) → push after claim.
   - Accept/decline (690/709) and invite revoked/expired → `retract(invite:<id>)`.
6. **Member left** (`routes/households.py` `_detach_member`, 178-284):
   - Replace `HouseholdLeaveNotification` row creation with `notify_user` to each remaining member (`collapse_id=left:...`, data `{type:"member_left", household_id}`).
   - Delete routes `GET /api/household-leave-notifications`, `POST .../{id}/dismiss`, `HouseholdLeaveNotificationOut`, the model; add `DROP TABLE IF EXISTS household_leave_notifications` to the startup DDL in `main.py` (and `worker.py` if mirrored).
   - Sends happen after commit, best-effort (never fail the HTTP request on push error). Pushes from routes run in a FastAPI `BackgroundTasks`.
7. Move device routes to `PUT/DELETE /api/devices` (keep `/api/imports/devices` as alias for already-shipped app builds).
8. **Tests** (pytest, mock `apns`): collapse-id/thread-id headers; retract on retry/dismiss/cancel only after a prior failed push; invitation push + retract on accept/decline; member-left push; dead-token pruning; localisation fallback to en.

## Phase 2 — Mobile notifications (`apps/mobile`)
1. **Delete**: `src/context/NotificationHistoryContext.tsx`, `src/components/BellMenu.tsx`, the provider in `app/_layout.tsx` (442-452), every `pushNotif`/`push` call (`_layout.tsx` 202, 240, 294-308, 317-333; `TimerContext/index.tsx` 57, 111-125, 162-175), `useHouseholdLeaveNotifications` + its API client functions/types in `packages/shared`, bell usages in the 5 headers (`RecipesScreen/HeaderRight.tsx`, `MealPlanScreen/useMealPlanHeader.tsx`, `(tabs)/shopping/index.tsx`, `SettingsScreen/index.tsx`, `GettingStartedScreen/index.tsx`).
2. **New `src/lib/presentedNotifications.ts`**: `dismissPresentedByCollapseId(collapseId)` — `getPresentedNotificationsAsync()` → filter `request.content.data.collapse_id` → `dismissNotificationAsync`. Replace `useClearImportFailureNotifications` with it (keep the existing call sites in `RecipesScreen/index.tsx` 442-449, 750-754 and the SSE handler, now keyed `import:<jobId>`).
3. **Silent retract**: add `expo-task-manager`; register `Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK)` at module scope (`src/lib/backgroundNotificationTask.ts`, imported from `app/_layout.tsx`) handling `type: "retract"` → `dismissPresentedByCollapseId`. Same handler in the foreground `addNotificationReceivedListener` (retract pushes must not show UI).
4. **Foreground reconcile**: on `AppState` → `active` and on the SSE `onSnapshot`, dismiss presented `import:*` notifications whose job is no longer `failed` in the snapshot, and `invite:*` whose invitation is no longer pending. Covers missed silent pushes (iOS throttles them).
5. **Tap routing** (`_layout.tsx` response listener + cold start `getLastNotificationResponseAsync`, which today only handles timers):
   `recipe_imported` → `/recipe/:id`; `recipe_failed` → `/(tabs)/recipes`; `household_invitation` → `/(tabs)/settings`; `member_left` → `/(tabs)/settings`; `timer_done` unchanged.
6. **app.json**: `ios.infoPlist.UIBackgroundModes: ["remote-notification"]`, `NSSupportsLiveActivities: true`; add `expo-task-manager` plugin.
7. **Move permission prompt + token registration** out of `TimerProvider` into a `usePushRegistration` hook (`src/hooks/usePushRegistration.ts`) used by `_layout.tsx`, so non-timer users still get prompted after login.

## Phase 3 — Invitations UI
- **Mobile**:
  - `(tabs)/_layout.tsx`: `<NativeTabs.Trigger.Badge>` on Settings with pending invitation count from `useHousehold().invitations`.
  - `SettingsScreen/InvitationsSection.tsx` (new, rendered above `HouseholdsSection` only when invitations exist): one row per invitation (household name, "from …"), tap → `Alert.alert` with Accept / Decline / Cancel using existing `api.acceptInvitation` / `api.declineInvitation` (logic lifted from `BellMenu.tsx` 189-209). Guard repeat taps with a per-invitation pending set; haptics on success/error.
- **Web**: delete `components/BellPopover.tsx`, `context/NotificationHistoryContext.tsx` (+ both providers in `App.tsx` and `AppShell.tsx`), `pushNotification` calls in `TimerContext.tsx`. Add `pages/SettingsPage/InvitationsSection.tsx` (accept/decline buttons, toast on result, logic from `BellPopover.tsx` 236-293) and a count badge on the Settings nav item in `AppShell.tsx`. Browser timer notifications via `sw.js` stay. Running-timer controls stay on the recipe page.
- **Locales** (all 7: en, pl, de, fr, es, it, pt): move used `bell.*` keys (`invitationTitle`, `invitedBy`, `from`, `acceptInvitationFailed`, `joinedHousehold*`, `declinedHouseholdTitle`, `timerDone*`) under `invitations.*` / `timers.*`; add `invitations.sectionTitle`, `invitations.accept`, `invitations.decline`; delete the remaining unused `bell.*` keys.

## Phase 4 — Timer Live Activity (iOS)
- **One activity for all timers.** `TimerAttributes.ContentState` holds every active timer (`timers: [TimerItem]`, running sorted by end date, then paused) plus a localized `moreFormat` (`timers.moreCount`).
  - Dynamic Island compact/minimal: countdown of the soonest-ending timer.
  - Expanded (up to 3 rows) and lock screen (up to 4 rows): one row per timer with title, step label and countdown, plus "+N more".
  - Each row links to its timer's deep link (`carrot:/` + `getTimerDestination`).
- **Target**: `@bacons/apple-targets`; `apps/mobile/targets/timer-activity/` (widget, app group `group.com.kulesza.carrot`, deployment 16.4). `TimerShared.swift` is a symlink to the module's copy so both compile the same types.
- **Buttons (iOS 17+)**: `LiveActivityIntent`s Pause / Resume / Cancel take a `timerId`.
  - They update only that timer in the content state.
  - Pause and Cancel remove its `UNNotificationRequest`, and Resume re-adds it. The identifier is `timer-<id>`.
  - Each writes a pending change to App Group `UserDefaults` (`timer-state`).
  - iOS 16.x is display-only.
- **Finished timers while suspended**: `ContentState.content()` sets `staleDate` to the soonest running end date; on that re-render, rows whose end date has passed show `timers.doneShort` with a checkmark and the island moves to the next running timer. iOS re-renders once per stale date, so later timers stay at 0:00 until the app syncs (server-driven updates are a follow-up).
- **Native module** `apps/mobile/modules/timer-live-activity`: `isSupported()`, `sync(timers, moreFormat)`, `endAll()`, `readPendingChanges()`. `sync` starts, updates or ends (on an empty list) the single activity.
- **TimerContext**:
  - An effect on `timers` (after hydration) calls `syncActivity` from `TimerContext/liveActivity.ts`. It dedupes identical payloads and caps at 6 timers to stay under ActivityKit's 4 KB state limit.
  - `readPendingChanges()` is applied on load and on `AppState` active.
  - Android and Expo Go: no-op (see [../android-release.md](../android-release.md)).

## Order / delegation
Phase 1 (sonnet) ∥ Phase 4 native scaffolding (sonnet) → Phase 2 (sonnet) → Phase 3 mobile + web (sonnet) → locales (haiku). Phase 2/3 depend on Phase 1's data contract (`collapse_id`, `type` values above). Clean up dead code in every touched file.

## Verification
- `cd services/api && uv run pytest` (new push tests + existing import tests).
- `pnpm -r typecheck` (or per-app `tsc --noEmit`) and lint for mobile, web, shared.
- Native rebuild: `cd apps/mobile && npx expo prebuild --clean && npx expo run:ios --device` (APNs + Live Activities need a real device; sandbox APNs is already configured).
- Manual on device:
  1. Import a blocked URL → "failed" push. Kill app. Retry from web → "failed" banner disappears (silent retract) and "imported" push appears replacing it; tap → recipe.
  2. Fail an import, dismiss it from web → banner removed.
  3. Invite the phone user from web → push; Settings tab shows badge; tap push → Settings; accept via Alert → badge clears, push retracted on other devices.
  4. Another member leaves → push on remaining members; no bell anywhere.
  5. Start a timer → Live Activity on lock screen/Dynamic Island; pause/resume/cancel from lock screen (iOS 17); reopen app → in-app timer matches; done → timer-done notification fires once.
  6. Rapid repeated taps on Accept/Decline and Live Activity buttons → single effect.
- Web: no bell; invitations accept/decline in Settings; nav badge; timer browser notification still fires.
- Update `docs/TODO.md` / README feature list if they mention the bell.
