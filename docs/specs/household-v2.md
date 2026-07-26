# Households v2 — Remove Personal, Multi-Household Recipes

## Context

Today "personal" is not a household row — it's a `NULL` sentinel. `users.active_household_id IS NULL`
means personal context, and `household_id IS NULL` on recipes/tags/meal-plan/shopping-list/import-jobs
means personal data. Roughly 35 endpoints branch on that sentinel, and the client mirrors it with a
synthetic `{ id: null, name: 'Personal' }` entry in the switcher. The result is two parallel scoping
rules for every feature, a lossy leave-household snapshot, and an account-deletion cascade that
destroys household recipes other members still rely on.

This change deletes the personal context entirely. Every user belongs to at least one household; a
recipe is owned by its author and linked to zero or more households via a join table. A user with no
household is shown a blocking gate offering create / join-by-code / accept-invitation. Recipes with
neither an author nor a household link are orphans and are cleaned up.

Supersedes `docs/specs/completed/household.md`.

Status legend: ☐ todo · ◐ in progress · ☑ done

## Decisions (resolved 2026-07-26, via /grill-me)

| Area | Decision |
|---|---|
| Personal context | **Removed.** No `NULL` household scope anywhere. Switcher keeps only real households. |
| Recipe ownership | `recipes.author_id` (nullable) + **`recipe_households` m2m**. One shared row across households — edits propagate. |
| Orphans | `author_id IS NULL` **and** zero household links → deleted **inline**, in the same transaction, incl. R2 thumbnail. |
| Existing personal recipes | Keep `author_id`, get **zero** household links → surface in Settings → My Recipes. Not auto-moved anywhere. |
| Existing personal meal plan / shopping list | **Deleted.** Not migrated. |
| New recipes | Linked to the creator's **active household** only. |
| Adding to more households | Explicit picker on **recipe detail** and in **Settings → My Recipes**. Only households you belong to. |
| Delete from `[household]` | Removes one link row. Available to any member of that household. |
| Delete from everywhere | **Author only.** Deletes the recipe row outright. |
| Settings → My Recipes | All rows where `author_id` = me. "Delete from [current household]" shown only when that recipe is linked to your active household; "Delete from everywhere" always. Plus view / edit / add-to-household. |
| Empty library | Empty state with "Add a recipe" and, when the shelf is non-empty, "Add from my recipes". No silent bulk move. |
| Gate | Blocks the whole app when you belong to zero households — **except Settings**, so migrated users can reach My Recipes and log out. |
| Invite code | One persistent code per household, **8 chars A–Z 0–9, stored upper-case, case-insensitive**, unique. Rotatable by an admin. |
| Join by code | Instant join, **rate limited** to 10 attempts/hour/user → 429. |
| Roles | `household_members.role` = `admin` \| `member`. Admins can kick and promote; **multiple admins allowed**. Last admin leaving promotes the earliest-joined remaining member. |
| Leave / kick | **Leaver keeps the original row**; the household gets a copy with `author_id = NULL`, **`created_at` preserved** so it keeps its position in newest-first sort. |
| Allergens | `personal_allergens` **kept per user** and **unioned** with the household's list at read time. No recipe re-analysis — flags already live in `components[].ingredient_flags`. |
| Old clients | No compatibility shims. Ship breaking, force update. |

---

## Data model

New table:

```
recipe_households
  recipe_id     UUID FK recipes.id     ON DELETE CASCADE
  household_id  UUID FK households.id  ON DELETE CASCADE
  added_at      TIMESTAMP NOT NULL
  PRIMARY KEY (recipe_id, household_id)
  INDEX (household_id)
```

Changed:

- **`recipes`** — rename `user_id` → `author_id`; make it **nullable**; change the FK from
  `ON DELETE CASCADE` to **`ON DELETE SET NULL`**. Drop `household_id` (after backfill) and
  `shared_to_personal`.
- **`household_members`** — add `role VARCHAR(20) NOT NULL DEFAULT 'member'`. `joined_at` already
  exists with real values; use it for admin backfill and succession.
- **`households`** — add `invite_code VARCHAR(8) UNIQUE NOT NULL`.
- **`meal_plan_entries`** — `household_id` → NOT NULL. Drop the `uq_meal_plan_personal` partial index;
  `uq_meal_plan_household` becomes a plain `UNIQUE (household_id, date)`.
- **`shopping_list_items`**, **`import_jobs`** — `household_id` → NOT NULL. Drop
  `import_jobs.shared_to_personal`.
- **`tags`** — drop `user_id` (custom tags are already predefined-only).
- **`user_preferences`** — drop `share_imports_to_personal`. Keep `personal_allergens`.

Dropped tables: **`recipe_personal_links`**.

`users.active_household_id` stays nullable — `NULL` now means "show the gate".

### Migration (`services/api/src/api/main.py` lifespan)

No migration tool exists; follow the established pattern of idempotent DDL + backfill SQL in the
`lifespan` block (`main.py:105-187`). `RENAME COLUMN` has no `IF EXISTS`, so guard it with a
`DO $$ ... information_schema.columns ... $$` block.

Order matters:

1. `CREATE TABLE IF NOT EXISTS recipe_households (...)`.
2. Backfill: `INSERT INTO recipe_households SELECT id, household_id, created_at FROM recipes WHERE household_id IS NOT NULL ON CONFLICT DO NOTHING`.
3. Rename `recipes.user_id` → `author_id`, drop NOT NULL, recreate FK as `ON DELETE SET NULL`.
4. `ALTER TABLE households ADD COLUMN IF NOT EXISTS invite_code VARCHAR(8)`, backfill one code per
   existing household (retry on collision), then `SET NOT NULL` + `CREATE UNIQUE INDEX`.
5. `household_members.role`, then promote the earliest `joined_at` member per household to `admin`.
6. Delete personal rows: `meal_plan_entries`, `shopping_list_items`, `import_jobs`, non-default
   `tags` where `household_id IS NULL`. Then `SET NOT NULL` on those `household_id` columns.
7. Drop `recipes.household_id`, `recipes.shared_to_personal`, `import_jobs.shared_to_personal`,
   `tags.user_id`, `user_preferences.share_imports_to_personal`, table `recipe_personal_links`.
8. One-time orphan sweep.

Rehearse against a dump of production before deploying — step 6 is destructive and irreversible.

---

## Backend

### `routes/context.py`

`get_active_household_id` becomes non-optional: returns `uuid.UUID`, raises **409 with
`NO_ACTIVE_HOUSEHOLD`** when the user has none, which is the client's cue to show the gate. Also fix
the existing bug where a stale `active_household_id` 403s every scoped endpoint (`context.py:27` — the
comment says "reset silently", the code raises): repoint to another household of theirs, else `NULL`.
`get_scope_key` drops its personal fallback.

### `routes/recipes.py`

`_recipe_filter` / `_recipe_write_filter` (`recipes.py:45-73`) collapse to a single `EXISTS` against
`recipe_households`. Remove `?personal=true`, `POST /{id}/link-to-personal`, and every
`shared_to_personal` reference.

New / changed endpoints:

- `POST /api/recipes` — creates the row, links it to the active household.
- `GET /api/recipes/mine` — `author_id = me`, any/no household; each row carries `household_ids`.
- `PUT /api/recipes/{id}/households` `{household_ids: [...]}` — replaces links, restricted to
  households you belong to. Replaces the old `link-to-household` (`recipes.py:521`), which refused
  recipes that already had a household.
- `DELETE /api/recipes/{id}/households/{household_id}` — "delete from [household]"; any member of
  that household. Runs the orphan check.
- `DELETE /api/recipes/{id}` — "delete from everywhere"; **403 unless `author_id == me`**. Deletes
  the row; links cascade. Also fix the existing gap that this endpoint never broadcasts
  `recipe_changed`, so other clients don't see removals.

`RecipeOut` gains `household_ids: list[UUID]` and `author_id: UUID | None`; loses `household_id` and
`shared_to_personal`. `added_by` now derives from a nullable author.

### `routes/households.py`

- `create_household` — generate `invite_code`, creator joins as `admin`.
- `POST /api/households/join` `{code}` — normalise (trim, upper, strip dashes), rate-limit
  10/hour/user → 429, join as `member`, set active, 404 on unknown code.
- `POST /api/households/{id}/rotate-code` — admin only.
- `DELETE /api/households/{id}/members/{user_id}` — admin only; runs the detach routine below.
- `POST /api/households/{id}/members/{user_id}/promote` — admin only.
- `leave_household` — rewritten around the detach routine.

**Detach routine** (shared by leave and kick) for user `U` and household `H` — replaces the current
lossy snapshot at `households.py:240-279`, which silently drops `total_time_minutes`, macros, `notes`,
`position`, and tags:

1. For each recipe `R` where `R.author_id == U` and `R` is linked to `H`:
   - Insert copy `R''` with **every** column carried over, `created_at` preserved, `author_id = NULL`.
   - Copy `recipe_tags`, and the `recipe_related_recipes` edges whose other side is also linked to `H`.
   - Link `R''` to `H`; unlink `R` from `H`.
   - Repoint `H`'s references from `R` to `R''`: `meal_plan_entries WHERE household_id = H`, and
     `user_recipe_favourites` for remaining members of `H`. The public share (if any) stays on `R`
     with its author.
   - Queue an embedding for `R''`.
2. Emit `HouseholdLeaveNotification` to remaining members (existing behaviour).
3. Delete the membership row. If `U` was the only admin, promote the earliest-joined remaining member.
4. If no members remain, delete the household — which now **drops links only**; authored recipes
   survive on their author's shelf, author-less ones become orphans.
5. Orphan-check every recipe that lost its last link.
6. Repoint `U.active_household_id` to another of their households, else `NULL`.

### Other routes

`meal_plan.py`, `shopping_list.py`, `tags.py`, `imports.py`, `export.py`, `allergens.py` — delete the
personal branch from each scope filter (`meal_plan.py:36-64`, `shopping_list.py:28`, `tags.py:16-19`,
`imports.py:31-34`, `export.py:41-69`, `allergens.py:42-45`).

`public_recipes.py:57-97` — `household_id` becomes required and must be one of yours.

`main.py` `DELETE /api/users/me` (`main.py:255-266`) — with `author_id ON DELETE SET NULL`, household
recipes now survive account deletion instead of vanishing for everyone else. After deletion, sweep
orphans and purge their R2 thumbnails. This closes the gap flagged in
`docs/specs/completed/app-store-review-checklist.md:32`.

### Orphan cleanup helper

One helper called inline from every path that can drop the last link or null the author (delete
from household, leave, kick, household wipe, account deletion): delete recipes with `author_id IS NULL`
and no `recipe_households` rows, and fire the existing R2 thumbnail delete used by
`DELETE /api/recipes/{id}`.

---

## Frontend

Web (`apps/web`) and mobile (`apps/mobile`) both, sharing `packages/shared`.

### `packages/shared`

- `types.ts` — `RecipeOut.household_ids` / `author_id`; `HouseholdOut.invite_code`; `MemberOut.role`.
  Drop `household_id`, `shared_to_personal`, `share_imports_to_personal`.
- `api/client.ts` (households block at `377-462`) — add `joinHouseholdByCode`, `rotateInviteCode`,
  `removeMember`, `promoteMember`, `listMyRecipes`, `setRecipeHouseholds`,
  `removeRecipeFromHousehold`. Remove `linkRecipeToPersonal`, `listPersonalRecipes`.
- `hooks/` — new `useMyRecipes`; extend `useHouseholds` / `useMembers`; delete `usePersonalRecipes`
  from `useRecipes.ts`. `useInvitations.ts` currently polls at 30s — accept a faster interval so the
  gate can poll at 10s while the bell stays at 30s.
- Add a shared `unionAllergens(household, personal)` helper; today's four call sites use
  `activeHousehold?.allergens ?? preferences?.personal_allergens ?? []`
  (`apps/web/src/pages/RecipesPage/helpers.ts:18`, `MealPlanPage/helpers.ts:14`,
  `SettingsPage/index.tsx:139`, `apps/mobile/src/screens/RecipeDetailScreen/index.tsx:339`).

### Gate

Web: `apps/web/src/components/AppShell.tsx` — when `households.length === 0`, render `HouseholdGate`
for every route except `/settings`, and collapse the nav to a Settings link. Web's `useHousehold()`
lacks `isLoadingHouseholds` (mobile has it at `HouseholdContext.tsx:36`) — add it, or the gate flashes
on first paint. Mobile: equivalent guard in the Expo Router authenticated layout.

The gate shows: pending invitations with Accept (polled at 10s — note `claim_email_invitations` already
attaches invites at signup, so an invited user sees theirs immediately), a code entry field, and
"Create a household". Reuse `CreateHouseholdModal`.

### Settings

- `ManageHouseholdModal.tsx` (web) / `HouseholdDetailScreen.tsx` (mobile) — invite code with copy +
  "Regenerate" (admins only), members list with role badges and Remove / Make admin (admins only).
  While here, switch web's member list to the existing `useMembers` hook; it currently does a raw
  imperative `listMembers` call at `ManageHouseholdModal.tsx:78-88`.
- New `MyRecipesSection` in `apps/web/src/pages/SettingsPage/` and the mobile `SettingsScreen` —
  all authored recipes, household badges per row, view / edit / add-to-household, and the two delete
  buttons per the rules above.
- Remove the mobile "Recipe import → share to personal" switch (`SettingsScreen/index.tsx:363-380`).

### Library and recipe detail

- `HouseholdSwitcher.tsx:91-97` — drop the synthetic Personal entry.
- Recipe detail (`apps/web/src/components/RecipeDetailModal/`, `apps/mobile/src/screens/RecipeDetailScreen/`)
  — "In households" checkbox picker, plus the two delete buttons.
- Empty library state: "Add a recipe", and "Add from my recipes" when `useMyRecipes` returns rows
  with no household.
- Remove the "also add to my private recipes" toggle from both add-recipe flows
  (`apps/web/src/components/AddRecipeModal/helpers.ts:232`,
  `apps/mobile/src/screens/NewRecipeScreen/helpers.ts:91`).

### i18n

New keys for the gate, invite code, roles, My Recipes, and both delete buttons in all five locales
(`packages/shared/src/locales/{en,pl,de,fr,es}.json`). Remove `households.personal`,
`households.personalHousehold`, `settings.personalScope`.

### Docs

This spec lives at `docs/specs/household-v2.md`; include it in the commits and move it to
`docs/specs/completed/` only once implementation is fully done (per `AGENTS.md`). Drop the now-moot
"Personal-only recipe filter" item from `docs/TODO.md`.

---

## Build order

1. **Schema + migration** — models, DDL/backfill in `lifespan`, orphan-cleanup helper. Drop & recreate
   dev DB, then rehearse against a production dump.
2. **Backend scoping** — `context.py`, recipes routes + m2m, then meal-plan / shopping-list / tags /
   imports / export / allergens / public-recipes.
3. **Backend households** — invite code, join, roles, kick/promote, detach routine, account deletion.
4. **Shared package** — types, client, hooks.
5. **Web** — gate, switcher, settings, recipe detail, empty state, i18n.
6. **Mobile** — same surfaces.

Commit at each step; per `CLAUDE.md`, confirm with the user before each commit.

---

## Verification

**Automated** — existing tests live in `services/api/tests/` (`test_meal_plan.py`,
`test_recipe_sharing.py`). Add `test_households_v2.py` covering:

- join by code: normalisation, unknown code → 404, rate limit → 429
- leave and kick: copy gets every column, `created_at` preserved, `author_id` NULL, household's
  meal-plan entries and favourites repointed, original keeps the leaver's other links
- orphan cleanup: last link removed with no author → deleted; with an author → survives
- delete-from-household vs delete-everywhere, incl. 403 for a non-author
- admin succession when the last admin leaves
- household wipe: authored recipes survive, author-less ones are collected

**Manual** (`pnpm be:web`, then `pnpm ios`) —

1. Fresh signup → gate appears, no nav, Settings still reachable.
2. Create household from the gate → lands in an empty library with both CTAs.
3. Second account: invite by email → invitation appears on the first account's gate within ~10s →
   Accept → joined.
4. Third account: join by code from Manage Household → joined. Rotate the code → old one 404s.
5. Import a recipe → lands in the active household. Add it to a second household from recipe detail →
   visible in both; edit in one → change shows in the other.
6. Delete from one household → gone there, still in the other and in Settings → My Recipes.
   Delete from everywhere as a non-author → 403; as the author → gone everywhere.
7. Admin kicks a member → member keeps their recipes on their shelf; household keeps author-less
   copies in the same sort position; the household's meal plan still resolves.
8. Last member leaves → household disappears; their authored recipes survive in My Recipes;
   author-less copies are gone from the DB along with their R2 thumbnails.
9. Allergens: set personal allergens differing from the household's → recipe badges show the union.
10. Delete an account holding household recipes → other members still see them, now author-less.

**Migration check** — against a production dump: personal recipes end up author-only with zero links
and appear in My Recipes; every former household recipe has exactly one `recipe_households` row;
personal meal-plan and shopping-list rows are gone; every household has a unique `invite_code` and
exactly one admin.
