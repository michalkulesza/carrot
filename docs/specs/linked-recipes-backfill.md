# Linked component recipes: re-import, backfill and on-tap import

Status: implemented, awaiting review

## Implementation notes (deviations)

- `import_jobs.status` is `VARCHAR(20)`, so `awaiting_children` (17 chars) needs no DDL.
- `spawn_linked_imports` skips links already resolved in the parent's components, so a re-import or
  backfill never queues a duplicate import for a link that is already attached. It returns the new
  child job ids only (a conflicting existing job is not returned).
- `attach_existing_recipes`, `import_linked_recipe`, `cancel_awaiting_parent`, `finalize_parent_of_child`,
  `finalize_overdue_parents` and `linking_household_id` were added to `linked_recipes.py` alongside the
  specified helpers. The overdue sweep runs in its own 60s `_awaiting_children_loop`.
- Parent progress is emitted as an `import_job.running` event; the `import_job.succeeded` event (and
  push) is emitted only at finalisation. Cancelling a waiting parent emits `import_job.cancelled`
  (no push) while the job row ends as `succeeded`.
- Child hiding is applied to both the SSE snapshot and the live event stream: a child's events are
  dropped while its parent job is `awaiting_children`, and for events created before the parent's
  finalisation. Failed children therefore stay hidden only around their parent's import; a later
  failure of a backfill/on-tap child is shown normally.
- `GET /recipes`, `/recipes/mine` and `/recipes/search` hide recipes of waiting imports; stats,
  related and `GET /recipes/{id}` are unchanged.
- The endpoint checks the URL against all raw `ingredient_links` (not the 5-link spawn cap) and uses the
  active household with the edit-access filter.
- Shared `useLinkedRecipeImport(recipeId)` hook wraps the mutation for web and mobile; web menu lives in
  `RecipeDetailModal/UnresolvedLinkMenu.tsx`. The public share view has no parent recipe id, so unresolved
  links there stay plain website links. Mobile shows `linkedImportQueued` in place of the link text after
  a queued import and an `Alert` with `linkedImportFailed` on error.
- Tests are mock-based like the existing suite (no live DB): `tests/test_linked_recipes.py` and
  `tests/test_linked_recipe_scripts.py`.

## Problem

"Shredded Buffalo Chicken Wraps" (prod recipe `2d9088fe-52fe-4273-8bfb-25031903fa9b`) links
"buffalo sauce" and "blue cheese dip" to their recipe pages. Tapping "open linked recipe" opens the
website instead of an imported recipe, the linked recipes are not in Related recipes, and the parent
stays `allergen_status = "uncertain"`.

Root cause (verified in prod): the linking flow from [linked-component-recipes](linked-component-recipes.md)
runs only inside `import_worker._process_job`. Production has **0** import jobs with
`parent_recipe_id`; all components have `linked_recipe_ids = [null, …]`.

- Recipes imported before that feature never spawned children (backfill was a non-goal).
- `scripts/reimport_recipes.py` rebuilds components with `serialize_components`, which resets every
  `linked_recipe_ids` slot to `None`, and never calls `spawn_linked_imports`. The 2026-10-10 full
  re-import therefore wiped any links and spawned nothing.
- An unresolved link (child not imported, child import failed, link added by editing) has no way to be
  imported on demand; the UI just opens the URL.

The allergen propagation itself already works once a link is resolved
(`resolve_linked_allergens` → `flag.linked_allergens`, parent recheck via `parent_recipe_ids`, web
`getRecipeAllergens`/`flagAllergens`, mobile `IngredientRow` linked label). This spec only makes links
actually resolve, and adds tests proving the parent shows the child's allergens.

## Goals

1. Re-imports keep existing links and spawn missing child imports.
2. A one-off backfill links every existing recipe in prod.
3. Tapping an unresolved linked ingredient imports it (or attaches an existing household recipe)
   instead of only opening the website.
4. Parent shows the child's allergens matching the user's/household's active allergens, on web and mobile.

## Backend

### 1. Decouple spawning from `ImportJob` (`services/api/src/api/services/linked_recipes.py`)

Change `spawn_linked_imports(session, parent, job)` to
`spawn_linked_imports(session, parent, *, user_id, household_id)`. The depth check
(`job.parent_recipe_id is not None` → return) moves to the worker call site, which already branches on
`current.parent_recipe_id`. Update `import_worker.py` and existing tests.

Add `def existing_linked_ids(components) -> dict[str, uuid.UUID]` — normalised link URL → stored
linked recipe id, used to carry links across a re-extraction.

### 2. Re-import script (`services/api/scripts/reimport_recipes.py`)

In `_reimport_recipe`, before overwriting components remember `existing_linked_ids(recipe.components)`.
After `_apply_extraction`:
- re-apply them with `set_linked_recipe_ids` (only ids whose recipe still exists);
- resolve user/household: `recipe.author_id` and the recipe's first `recipe_households` row (ordered
  by household id for determinism). If either is missing, log and skip spawning;
- skip spawning when the recipe is itself a component (see `is_component_recipe` below);
- call `spawn_linked_imports(...)` then `allergen_rechecks.enqueue_recipe_allergen_check` when the
  recipe has any links.

### 3. Backfill script (`services/api/scripts/link_component_recipes.py`, new)

`uv run --no-sync python scripts/link_component_recipes.py [--apply] [--recipe-id ID ...]`
- Dry run by default: print per recipe the title, links and planned action (attach existing / queue
  child import / skip with reason).
- Candidates: recipes with at least one `ingredient_links` entry whose `linked_recipe_ids` slot is null.
- `is_component_recipe(session, recipe)` (put in `linked_recipes.py`): true when another recipe in the
  same household links to this recipe's normalised `source_url`, or the recipe is the
  `result_recipe_id` of a job with `parent_recipe_id`. Components are skipped (depth = 1).
- `--apply` runs `spawn_linked_imports` per recipe in its own transaction, then commits; child jobs are
  picked up by the running worker. Idempotent: rerunning creates nothing new (deterministic
  idempotency key + `on_conflict_do_nothing`).
- Calls `init_sentry()` like the reimport script.

### 4. On-demand import endpoint (`services/api/src/api/routes/recipes.py`)

`POST /recipes/{recipe_id}/linked-recipes` body `{ "url": str }` → `{ "recipe_id": str | null, "job_id": str | null }`.
- Auth: same access check as editing the recipe; household = the active household the recipe belongs
  to that the user is a member of (reuse existing recipe-access helpers).
- 422 unless `normalize_link(url)` matches one of the recipe's `ingredient_links` (prevents using it as
  a generic import endpoint).
- If the household already has a recipe with that source URL → `set_linked_recipe_ids`,
  `add_related_recipes`, enqueue allergen recheck, return `recipe_id`.
- Else look up the child job by `(user_id, _child_idempotency_key(parent.id, url))`:
  - none → insert it (same values as `spawn_linked_imports`), emit `import_job.created`;
  - `failed` / `cancelled` → reset like `retry_import_job` does (status pending, clear failure fields,
    `dismissed_at = None`), emit update event;
  - pending/running/succeeded → leave as-is (if succeeded with `result_recipe_id`, attach and return
    `recipe_id`).
  Return `job_id`. Safe under repeated taps (unique key + row lock).
- Add `linkRecipeImport(recipeId, url)` to the shared API client (`packages/shared/src/api/client.ts`)
  and types.

### 5. Parent import stays busy until its children finish

When a worker import spawns child jobs, the parent's import is not "done" until every child has
reached a terminal state (succeeded, failed or cancelled).

- New `ImportJobStatus.AWAITING_CHILDREN = "awaiting_children"` (DB only; add the enum value with the
  same idempotent DDL pattern in `main.py` if the column is a PG enum, otherwise nothing). In
  `ImportJobOut` / SSE events it is serialised as `"running"` so web and mobile keep showing the busy
  card with no client change.
- In `_process_job`: after `_save_recipe` + `spawn_linked_imports`, if at least one child job was
  created or is still non-terminal, set the parent job to `AWAITING_CHILDREN` (keep `result_recipe_id`)
  instead of `SUCCEEDED`, and don't send the "recipe imported" push yet. `spawn_linked_imports` returns
  the list of child job ids for this.
- Hide the parent recipe until it finishes: recipe list/search endpoints (`list_recipes` and any other
  library listing, e.g. search/meal-plan pickers) exclude recipes that are the `result_recipe_id` of a
  job in `AWAITING_CHILDREN`. Direct `GET /recipes/{id}` still works.
- Finalisation `finalize_parent_if_ready(session, parent_job_id)` (in `linked_recipes.py`): lock the
  parent job; if all its child jobs (`parent_recipe_id == result_recipe_id`, same user) are terminal, set
  it `SUCCEEDED`, emit the normal succeeded event and push. Call it whenever a child job reaches a
  terminal state (succeeded in `_process_job`, failed in the failure path, cancelled in
  `cancel_import_job`), after `attach_child_to_parent`.
- Safety net: `_requeue_stale` must not touch `AWAITING_CHILDREN`. A periodic check in the worker loop
  finalises any parent waiting more than 10 minutes (children stuck/lost), so a parent can never stay
  busy forever. Cancelling the parent job while waiting finalises it as succeeded (the recipe is already
  saved) and cancels its pending children.
- Children are not shown as separate cards in the import queue while their parent is waiting (filter
  jobs with `parent_recipe_id` whose parent job is `AWAITING_CHILDREN` out of the list endpoint), so the
  user sees one busy card per import. Failed children stay hidden too; the linked line simply remains
  unresolved and can be imported on tap (§4).
- Backfill and on-tap imports don't use this: the parent already exists and is visible.

Tests: parent stays `running` (serialised) while a child is pending; finalises after the last child
succeeds or fails; parent recipe hidden from `list_recipes` until then; stale requeue ignores it;
10-minute safety net finalises; no push until finalisation.

## Frontend

### Mobile (`apps/mobile/src/screens/RecipeDetailScreen/IngredientRow.tsx`, `UnifiedIngredientsSection.tsx`)

- Resolved link (`linked_recipe_ids[i]` set): unchanged — navigate to the recipe in-app.
- Unresolved link: tapping shows `ActionSheetIOS.showActionSheetWithOptions` with
  "Import linked recipe", "Open website", "Cancel". Import calls the endpoint via `useMutation`;
  if it returns `recipe_id` navigate to it, otherwise light haptic + the job appears in the import
  queue (invalidate `['importJobs']`). Disable re-entry while the mutation is pending.

### Web (`apps/web/src/components/RecipeDetailModal/LinkedRecipeLink.tsx` and callers)

- Unresolved link: clicking opens a small `PopupSurface` menu with "Import linked recipe" and
  "Open website" (button elements, aria-labels, keyboard accessible, closes on outside click/Escape).
  Same mutation semantics as mobile; on `recipe_id` open it via the existing `onOpenRecipe`.

### Allergens

No logic change expected. Verify, and fix if not true:
- web: `getRecipeAllergens` badges and `LinkedAllergenBadges` include child allergens that match active
  allergens; the (?) uncertain icon disappears for resolved links;
- mobile: `IngredientRow` linked-allergen label shows for matching active allergens;
- the "allergen information incomplete" notice disappears once every link is resolved.

### Translations

New keys (en, pl, de, fr, es): `recipes.importLinkedRecipe`, `recipes.openLinkedWebsite`,
`recipes.linkedImportQueued`, `recipes.linkedImportFailed`.

## Tests (`services/api/tests/test_linked_recipes.py` and route tests)

- Re-import preserves `linked_recipe_ids` and spawns children for unresolved links.
- Backfill: dry run writes nothing; apply spawns, skips component recipes, idempotent on rerun.
- Endpoint: rejects URLs not in the recipe; attaches existing household recipe; creates child job;
  resets failed child; repeated calls return the same job.
- End-to-end allergen: child analysed with `gluten` → parent recheck sets `linked_allergens == ["gluten"]`
  on that line and parent status `analyzed` once all links resolve; `recipe_allergens(parent)` includes it.
- Web/mobile: typecheck; extend any existing helper tests for `flagAllergens`.

## Rollout

1. Deploy (push to master → `deploy-api.yml`).
2. In `carrot-api-1`: `uv run --no-sync python scripts/link_component_recipes.py` (dry run), review, then
   `--apply`. Check the buffalo wraps recipe gets two related recipes and resolved allergens.
