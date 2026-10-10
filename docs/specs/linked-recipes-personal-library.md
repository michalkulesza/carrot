# Linked component recipes for personal-library recipes

Status: implemented, awaiting review

Follow-up to [linked-recipes-backfill](linked-recipes-backfill.md),
[linked-recipe-link-kinds](linked-recipe-link-kinds.md) and
[self-links-and-text-sanitising](self-links-and-text-sanitising.md).

## Problem

A recipe with no `recipe_households` row lives in its author's personal library (`GET /recipes/mine`,
filtered by `Recipe.author_id`). Prod has 65 (61 Weronika's, 4 Michal's), e.g. a "Shredded Buffalo
Chicken Wraps" copy `8f6b3ed8-4f97-474d-8828-84d2b1731899`, "Thai Grilled Chicken" `fbbd9dbc…`,
"Easy Fish Tacos Recipe", several stir-fries.

Linked-recipe import only works for household recipes:
- `import_jobs.household_id` is `NOT NULL` and the worker links the saved recipe to `job.household_id`
  (`_save_recipe` → `_link_recipe_to_household`) and checks membership (`_is_member`).
- `scripts/link_component_recipes.py` and `scripts/reimport_recipes.py` skip with "missing author or
  household"; the tap endpoint `POST /recipes/{id}/linked-recipes` resolves a household and can't serve
  personal recipes.

So personal recipes keep unresolved recipe links and stay `allergen_status = "uncertain"`.

## Goal

A child import for a personal-library parent produces a personal-library child (same author, no
household), and everything else (linking, related recipes, allergen propagation, parent waiting state,
tap import, backfill) works the same as for household recipes.

## Design

- Make `import_jobs.household_id` nullable (idempotent `ALTER TABLE import_jobs ALTER COLUMN household_id
  DROP NOT NULL` next to the existing DDL in `services/api/src/api/main.py`; model `Mapped[uuid.UUID |
  None]`). Only child jobs (`parent_recipe_id` set) may have `household_id = None`; the public enqueue
  route keeps requiring an active household. Check every reader of `job.household_id` (import routes
  scoping/SSE, `_job_out`, worker, monitoring, device capture eligibility, `finalize_*`) and make `None`
  safe. Personal child jobs are never listed in any household queue; that's fine because spawned
  children are hidden/auto-dismissed anyway, and tap-initiated personal children should be visible to
  their user: extend the import jobs list/SSE scope to include the user's own jobs with
  `household_id IS NULL` (check how `_scope_filter` / `subscribeImportJobs` scope works and do the
  minimal correct thing; if it is large, report instead of redesigning).
- Worker: when `job.household_id is None`, `_is_member` is true iff the parent recipe still exists and
  `parent.author_id == job.user_id`; `_save_recipe` skips household linking (recipe stays personal,
  `author_id = job.user_id`); tags/allergens come from `_get_tags_and_allergens(session, user_id, None)`
  (already supports `None`).
- Linking helpers: `spawn_linked_imports(..., household_id=None)` and `_household_recipes_by_url` reuse an
  existing recipe in the author's personal library (`author_id == user_id` and no household row) when
  `household_id` is None. `linking_household_id` returning None for an authored recipe means "personal",
  not "skip": update the backfill and re-import scripts accordingly (skip only when `author_id` is None).
- Tap endpoint: allow the recipe's author to import links on a personal recipe (household None); keep the
  existing household access rules otherwise.
- Allergens: child jobs for personal parents use the author's personal allergen settings (whatever
  `_get_tags_and_allergens(..., None)` returns today).

## Tests

- worker: personal child job saves a recipe with no household row and attaches to the parent;
  membership check passes for the author and fails when the parent is gone or owned by someone else.
- spawn/backfill: personal parent spawns jobs with `household_id = None`; reuses an existing personal
  recipe with the same URL; recipes with `author_id = None` are still skipped.
- tap endpoint: author can import a link on a personal recipe; another user gets 404/403 as today.
- device capture eligibility and job serialisation tolerate `household_id = None`.

## Rollout

Deploy, then `uv run --no-sync python scripts/link_component_recipes.py` (dry run) in `carrot-api-1`,
review, `--apply`.

## Implementation notes

- `import_jobs.household_id` is nullable (model + idempotent `DROP NOT NULL`); the startup `DELETE ... WHERE household_id IS NULL` / `SET NOT NULL` pair was removed, since it would have wiped personal jobs on every boot. The public enqueue route still requires an active household.
- Job list/SSE scope (`_scope_filter` in `routes/imports.py`) is now `household_id = active OR (household_id IS NULL AND user_id = me)`; no frontend change (same endpoint). Job actions (retry/cancel/dismiss/captured-html) on a personal job are limited to its owner.
- Worker: `_is_member` for a personal job checks the parent recipe exists and `author_id == job.user_id`; `_save_recipe` skips household linking and uses default tags only; `_replace_recipe` skips the household lookup.
- `_household_recipes_by_url` takes a required `user_id`; with `household_id=None` it matches the author's recipes with no household row. `is_component_recipe` also considers the author's personal recipes when the recipe has no household.
- Tap endpoint: the author may import links on their own personal recipe (jobs created with `household_id=None`); household-shared recipes behave as before.
- Backfill/re-import scripts skip only when `author_id` is missing; a personal recipe is processed with `household_id=None`.
- Rollout step unchanged. Not deployed.
