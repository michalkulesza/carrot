# Live Home/Browse/detail, reliable streams, recipe edit lock

## Context
Household members edit recipes and the meal plan from different devices. Wanted:
- Home (Recently added, Favourites, Next meal), Browse and recipe detail update live when someone else
  changes a recipe or the meal plan, like the shopping list does.
- Only one person can edit a recipe at a time; the other gets a message. No silent overwrites.
- Pull-to-refresh was considered and dropped: reliable streams + refetch-on-foreground make it redundant.

What already exists (no new streaming infrastructure needed):
- `services/api/src/api/broadcaster.py` — in-memory pub/sub + presence with 15 s TTL and
  `is_locked_by_other`. Single uvicorn worker in prod (`services/api/Dockerfile`), so in-memory is fine.
- `/api/recipes/stream` publishes `recipe_changed` (mostly with `id`) on every recipe write, including
  allergen rechecks; `/api/meal-plan/stream` publishes `meal_plan_changed`. Server heartbeats every 15 s.
- `packages/shared/src/hooks/useRecipes.ts` already subscribes and invalidates `['recipes']`. Home, Browse and
  RecipeDetail all read from `useRecipes`, so recipe edits are already live on those screens.
- `GET /api/recipes/{recipe_id}` exists (`routes/recipes.py:475`); no shared client function for it yet.
- Shopping list lock pattern: `POST /shopping-list/presence` + 409 backstop (`routes/shopping_list.py:273`).
- Schema changes are startup `ALTER TABLE … IF NOT EXISTS` statements in `services/api/src/api/main.py`.

Gaps found:
1. `useNextMealPlanEntry` never calls `useMealPlanStream` → Home's Next meal only updates if the Meal plan tab
   is mounted.
2. Meal plan entries embed recipe title/thumbnail, but `recipe_changed` doesn't touch `['mealPlan']`.
3. Streams have no stall detection (half-open connection hangs on `reader.read()` forever); mobile has no
   `focusManager` wiring, so foregrounding doesn't refetch.
4. Every `recipe_changed` refetches the **whole** recipe list (~171 recipes, ~0.9 MB of components JSON
   locally, uncompressed — no GZip in the app, no `encode` in Caddy) on every household device. A bulk
   allergen recheck emits one event per recipe → a refetch storm.
5. No edit lock or conflict detection on `PUT /api/recipes/{id}`.

Step 0: save this plan as `docs/specs/recipe-live-updates-and-edit-lock.md` and include it in the commit.

## 1. Live updates, efficient (shared, benefits web too)
- `packages/shared/src/api/client.ts`: add `getRecipe(id)` for the existing endpoint.
- `packages/shared/src/hooks/useRecipes.ts` stream listener: **coalesce** events (collect ids for ~300 ms,
  max wait 2 s), then:
  - event without id, or >10 ids in the batch → `invalidateQueries(['recipes'])` (full refetch, as today);
  - otherwise fetch each id with `getRecipe` and patch `['recipes']` via `setQueryData` (replace, or insert
    if new; 404 → remove — deleted or unshared from this household).
  - Patch failure (network) → fall back to invalidating `['recipes']`.
- Meal plan freshness: after a batch, invalidate `['mealPlan']` only if a changed id appears in any cached
  meal-plan query (cheap scan of `getQueriesData(['mealPlan'])`), or the batch had no ids.
- `packages/shared/src/hooks/useNextMealPlanEntry.ts`: call `useMealPlanStream()` (ref-counted shared SSE).
- Own writes echo back as events too — acceptable, they become one small `getRecipe` call.

## 2. Reliable streams
- `subscribeStream` in `packages/shared/src/api/client.ts`: idle watchdog — reset a ~35 s timer on every chunk;
  on expiry abort the controller so the existing reconnect path runs (fires `onResubscribe` → resync).
  Clear on stop/finally. **Don't report the watchdog's AbortError to Sentry** (`reportError` currently reports
  every failure) — only report unexpected errors, to avoid noise from every backgrounded phone.
- Mobile: wire React Query `focusManager` to `AppState` where the QueryClient provider lives, so stale queries
  refetch on foreground.

## 3. Edit lock (server enforced) + version check
Backend (`services/api/src/api/routes/recipes.py`, `models.py`, `main.py`):
- New column `recipes.edit_version INTEGER NOT NULL DEFAULT 1` (startup ALTER), exposed on `RecipeOut`.
  **Not `updated_at`**: it has `onupdate`, so the async allergen recheck that runs after every save (it writes
  `allergen_status`/`components`) would bump it and cause false "someone changed this" conflicts on the
  user's next save. `edit_version` increments only on content edits: `PUT`, and any other endpoint that writes
  fields PUT also writes (e.g. notes — verify NotesSection's endpoint; PUT writes `recipe.notes`, so an
  unversioned notes edit by B would be silently overwritten by A's save).
  Also bumped by reimport/re-extraction (`apply_extraction`) and by the background linked-recipe rewrites of a
  parent's `components` (`attach_child_to_parent`, `mark_link_external`), so an open draft gets a conflict
  instead of overwriting them. The allergen recheck does not bump it.
- `POST /api/recipes/{recipe_id}/edit-lock` `{action: "start" | "keepalive" | "stop"}` (before `/{recipe_id}`
  routes). Use a dedicated in-memory registry (`services/api/src/api/services/recipe_edit_locks.py`, TTL 15 s), global
  rather than per household:
  a recipe can belong to several households (`recipe_households`), and members of different households must
  still see each other's lock. Check write access with `_recipe_write_filter` like PUT.
  - start and keepalive behave the same (keepalive re-creates the lock after a server restart/deploy).
  - The lock is per **client**: each API client instance sends a random `X-Carrot-Client-Id` header (one per
    app launch on mobile, per tab on web). Held by a different (user, client) → 409
    `{code: "recipe_locked", editor: <nickname>, same_user: bool}`. Same user and client → refresh (idempotent).
    `stop` only releases a lock held by the same client.
  - stop when not held → 204.
- `PUT /{recipe_id}` (and the notes endpoint): 409 `recipe_locked` if `is_locked_by_other`; optional
  `expected_edit_version: int | None` in the body — mismatch → 409 `{code: "recipe_changed"}`; increment
  `edit_version` on success. Optional, so web keeps working unchanged.
- Tests: lock start/keepalive/stop; other user → 409; same user idempotent; keepalive recreates after expiry;
  PUT blocked while locked; stale version → 409; allergen recheck does **not** bump `edit_version`;
  cross-household lock visible.

Shared: types (`edit_version`, `expected_edit_version?`), `api.setRecipeEditLock(id, action)`, surface the 409
`code`/`editor` on the thrown error.

Mobile (`apps/mobile/src/screens/RecipeDetailScreen/`, mainly `useEditDraft.ts` + where Edit is entered):
- Edit tap: enter edit mode **optimistically** and call `start` in parallel (no spinner on the common path);
  on 409 exit edit mode + `Alert.alert` "{{name}} is editing this recipe". In-flight ref guards double taps.
  Remember `edit_version` at entry.
- While editing: `keepalive` every 5 s; network failures are ignored (next tick retries). A keepalive 409
  (someone took over after our lock lapsed) → alert immediately, not only at save time.
- AppState: iOS suspends timers in background, so the lock lapses after 15 s. On returning to `active` while
  editing → `start` again; 409 → same alert.
- Save: send `expected_edit_version`; success → `stop`. 409 `recipe_changed` → alert with "Reload" (discard
  draft, refetch, exit edit) / "Cancel" (keep draft). 409 `recipe_locked` → "is editing" alert.
- Cancel/unmount → `stop` (fire-and-forget; TTL covers crashes).
- Recipe deleted (or removed from household) by someone else while open: the list patch removes it → detail
  screen shows an alert and navigates back instead of rendering empty. Same if a save returns 404.
- Live updates while editing must not reset the local draft.
- Error reporting: report lock/save failures to Sentry only when they're not 409/404/network errors.
- New strings (locked alert, conflict alert, Reload, recipe-deleted alert) in all 7 locales.

Web (`apps/web/src/components/RecipeDetailModal/useRecipeEditLock.ts`): claims the lock whenever the modal is
not in view mode (start, 5 s keepalive, restart on tab visible, stop on leave/unmount/`pagehide` with
`keepalive` fetch), sends `expected_edit_version` on save. `recipe_locked` shows a toast and discards the
draft; `recipe_changed` shows a toast with a Reload action. A second device of the same user gets
"You're editing this on another device" (`same_user`).

## Optional, separate (prod config, not in this change)
Enable compression in Caddy (`encode zstd gzip` on `app.carrot.xcxz.xyz`): the recipe list JSON is ~1 MB+
and compresses ~10×. Needs your OK since it changes the production server.

## Verification
- `uv run pytest` (new tests + existing recipe tests).
- `pnpm tsc --noEmit` in apps/mobile, apps/web, packages/shared.
- Two simulators (or sim + web), same household:
  - A edits a recipe → B's Home/Browse/detail update; network inspector shows a single `GET /recipes/{id}`,
    not a full list refetch. Next meal on B updates when A changes the meal plan or the planned recipe.
  - Change household allergens (bulk recheck) → B does one full refetch, not one per recipe.
  - A taps Edit → B taps Edit → alert "A is editing". A saves → B can edit.
  - A in edit mode, kill A's app → B can edit after ~15 s. A backgrounds 1 min, B takes the lock, A returns
    → A gets the alert.
  - A saves, waits for the allergen recheck to land, saves again → no false conflict.
  - B deletes the recipe while A views it → A gets the alert and goes back.
  - Web save while A is editing → rejected.
  - B backgrounded a few minutes, A changes a recipe, B foregrounds → B shows the change.
  - B's network off/on → stream reconnects within ~35 s and resyncs; no Sentry events from the watchdog.

## 4. One live-update stream per client

Why: Expo installs `expo/fetch` as the global `fetch` on native (`expo/src/winter/runtime.native.ts`), so
normal requests and SSE streams share one `URLSessionConfiguration.default` session, which allows 4
connections per host on iOS. The app held 4–5 SSE streams (recipes, meal plan, shopping list, import jobs),
so other requests queued on the phone until a stream dropped: random 20 s timeouts, failed saves. A server
request log showed a 3-minute gap followed by five queued lock keepalives arriving in the same second.
HTTP/2 in production likely masks it, but one connection is the right shape everywhere.

Server: `GET /api/events` (SSE) multiplexes the four existing channels over one connection.
- Releases its DB session before streaming (same as the other streams).
- Envelope: each `data:` payload gains `"channel": "recipes" | "mealPlan" | "shoppingList" | "importJobs"`,
  the rest of the payload unchanged from the existing per-channel streams.
- On connect: the shopping-list `list_snapshot` + `presence` and the import-jobs snapshot, as the existing
  endpoints send today.
- Import jobs keep their DB-cursor polling and `Last-Event-ID` resume; SSE `id:` is used only for import-job
  events.
- Heartbeat every 15 s; stop on client disconnect; unsubscribe every broadcaster queue on exit.
- The four old endpoints stay for already-shipped app builds; clients stop using them.

Client (`packages/shared`): one ref-counted `/api/events` subscription shared by all hooks, dispatching by
channel. `useRecipes`, `useMealPlanStream`, `useShoppingList` and `useImportJobs` keep their public API and
behaviour (coalescer, reconnect resync, presence, import resume). The idle watchdog, reconnect backoff and
`onResubscribe` resync per channel are preserved.
