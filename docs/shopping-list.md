# PlateKeeper — Shopping List Feature

An Apple-Reminders-style shopping list, scoped to the active context (household = shared,
Personal = private). One flat list per scope — no list grouping. Items can be added
manually or pulled from a recipe's ingredients. Real-time, multi-user: members of the same
household see each other's changes live and get a Google-Docs-style "who's here / who's
editing" presence with a soft edit-lock.

Status legend: ☐ todo · ◐ in progress · ☑ done

## Decisions (resolved 2026-06-16, via /grill-me)

| Area | Decision |
|---|---|
| Persistence | **Backend-persisted** (not local) — fits the rest of the app (React Query + REST). |
| Scoping | **Household-aware**, mirrors meal plan: active household → shared household list; Personal → `household_id IS NULL`. One list per scope, no grouping UI. |
| Item shape | **Single text string** + checkbox. Compose recipe lines as `qty + unit + name` (note dropped). Manual items are free text. |
| Checked behaviour | Completed items **stay visible**, struck through, collected at the **bottom**; a header **"Clear completed"** removes them. Unchecking returns the item to the bottom of the incomplete section. |
| Item gestures | Tap circle = toggle · swipe = delete · tap text = **inline edit** · drag = **reorder** (incomplete only; completed render as a non-draggable footer). |
| Manual add | **Inline add row** at the bottom (Reminders style): submit-on-return, auto-refocus, appends to end of incomplete. |
| Recipe → list | **Cart-plus icon in the recipe nav header** toggles **add-mode** across all components → each ingredient shows a `+`; tap adds it; `+`→✓ for the session (tracks this session only, no cross-check of the real list). An **"Add all"** row sits at the top of the ingredients while in add-mode. |
| Add feedback | **Haptic only** — `expo-haptics` `impactAsync(Light)` on each add. The ✓ is the visual confirmation; no toast. |
| Real-time transport | **SSE** (`text/event-stream`), reusing the existing fetch-based stream pattern (`apiFetch` + `getReader()` + `TextDecoder`, auth-aware, returns a cancel fn). On any change the server pushes the **full list snapshot** to the scope; clients `setQueryData` directly. |
| Presence | Two layers: per-item **editing badge** ("Anna…") + a header **"who's here"** indicator. Each active user gets a **stable color** derived from user id, shown with nickname. |
| Presence trigger | Fires when a user **focuses an item's inline-edit field**: client sends `start` on focus, `stop` on blur/submit, keepalive every ~8s. Server **auto-expires** stale presence (TTL ~15s) so a backgrounded/crashed app leaves no ghost. |
| Soft lock | While user A edits item X, others **can't open X's text field** (disabled + lock affordance) and **can't delete X**; everything else stays free. |
| Lock enforcement | **Advisory UI lock + server 409 backstop**: `PATCH` text-edit / `DELETE` on an item held by another *active* presence is rejected `409`. TTL auto-releases the lock; once presence is gone, **last-write-wins** is the fail-safe. No permanent/deadlock locks. |
| Edit conflict | Same-item simultaneous text edits = **last-write-wins**; the presence badge is the warning. |
| Other conflicts | Adds never conflict (new rows). Toggle = last-write-wins. Reorder = client sends full ordered id list; server rewrites `position` in one transaction; clients reconcile via the next snapshot. |
| Broadcaster | All publish/subscribe + the presence registry go through a single **`broadcaster` module** with a clean interface; default impl is **in-memory/asyncio**. Routes/hook/UI never touch the implementation. |
| Scaling | In-memory is single-worker only — fine well into the thousands of users (per-scope connections are ~2–5; idle SSE is cheap on async). Upgrading to **Postgres `LISTEN/NOTIFY`** (no new infra) or **Redis pub/sub** is a one-file swap, needed only when running ≥2 workers/containers. Documented at the top of the module. |
| Migrations | No Alembic — `create_all` builds the new table (drop & recreate dev DB if needed). |
| Scope of work | **Mobile only**; web app out of scope for now. |

## Data model

- **`shopping_list_items`**: `id` (uuid PK), `user_id` (FK users, creator), `household_id`
  (nullable FK households, `ON DELETE CASCADE`), `text` (str), `completed` (bool, default
  false), `position` (int), `created_at`, `updated_at`.
- Sort: incomplete by `position` asc, then completed at the bottom. Checking an item sets
  `completed = true` and bumps `position` to the end.
- Presence + locks are **in-memory only** (not persisted): registry of
  `{user_id, nickname, color, item_id, expires_at}` per scope, TTL ~15s.

## API (`/api/shopping-list`)

- `GET /` — list for the active scope (sorted).
- `POST /` — add one or many items (one body shape supports "Add all").
- `PATCH /{id}` — toggle `completed` and/or edit `text`. **409** if the item is held by
  another active presence (text edits).
- `PATCH /order` — reorder; body = full ordered id list of incomplete items.
- `DELETE /{id}` — delete. **409** if the item is actively edited by another user.
- `DELETE /completed` — clear all completed items.
- `GET /stream` — **SSE**; subscribes to the caller's scope; emits full-list snapshots on
  change + presence events; heartbeat to keep the connection alive.
- `POST /presence` — announce `start` / `stop` / keepalive for an item; broadcast to scope.

## Shared (`packages/shared`)

- `ShoppingListItem` + presence types in `types.ts`.
- Client methods in `api/client.ts`, incl. an SSE consumer reusing the existing streaming
  pattern (returns a cancel fn).
- `useShoppingList` hook: list query (seeded/updated by SSE `setQueryData`), **optimistic**
  mutations (add / toggle / edit / reorder / delete / clearCompleted), presence state +
  `setEditing(itemId | null)` helper.

## Mobile UI

- **`ShoppingListScreen`** (replaces the stub): incomplete draggable list, completed footer,
  inline add row, header **Clear completed** menu, presence chips (who's here) + per-item
  editing badge, soft lock on locked items, empty/loading states.
- **`RecipeDetailScreen`**: cart-plus header icon → add-mode; `+` per ingredient with
  `+`→✓; "Add all" row; haptic on add.
- Conventions: `PlatformColor`, HIG type scale, `Pressable`, React Query throughout. All new
  strings (`shoppingList.*`, recipe cart labels, presence text) added to **all 5 locales**
  (en, pl, de, fr, es).

## Build plan (staged, reviewable commits)

1. ☑ **Backend + shared CRUD** — model, plain REST routes (no SSE), shared types/client/
   `useShoppingList`, working `ShoppingListScreen` (list, add row, toggle, swipe-delete,
   inline edit, drag-reorder, clear-completed). Single-user list, fully usable.
2. ☑ **Recipe → list** — cart-plus add-mode, "Add all", `expo-haptics`, `+`→✓.
3. ☑ **Real-time + presence/lock** — `broadcaster` module, SSE stream + presence endpoints,
   hook wiring (snapshot via `setQueryData`), presence chips + per-item editing badge + soft
   lock + 409 backstop.

Translations land with each stage's strings; commit after each stage.
