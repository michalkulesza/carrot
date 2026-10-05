# Import linked component recipes

Status: implemented, awaiting review

## Implementation notes (deviations from the plan)

- `recipe_components.serialize_components` (shared by import and reimport) now writes
  `linked_recipe_ids` (all `None`). `RecipeComponent` (the extraction/LLM model) is not extended;
  only `SaveComponent` carries the field.
- Shared related-recipe writer lives in `services/related_recipes.py` (`add_related_recipes`);
  `set_related_recipes` uses it too.
- `linked_recipes.py` also exposes `recipe_allergens` and `parent_recipe_ids`. It imports
  `allergen_rechecks` as a module (not names) because `allergen_rechecks` imports it back.
- `_process_job` runs spawn/attach inside a SAVEPOINT and logs failures, so linking can never lose an
  imported recipe. Child jobs keep their `input` URL (parents' inputs are still cleared) so the
  retried-child branch can still find the parent's link. The `source_url` passed to
  `report_missing_critical_fields` is now read before `input` is cleared (it was always `None`).
- `attach_child_to_parent` returns early (no related row, no recheck) when no ingredient link in the
  parent matches the child URL any more (e.g. the user removed the link).
- Save route: incoming `linked_recipe_ids` are ignored (server-owned); a stored id is kept only while
  the same line still has the same link.
- Web: new `LinkedRecipeLink` and `LinkedAllergenBadges` components; `onOpenRecipe` is threaded through
  `RecipeViewLayout`, `RecipeComponentColumn`, `IngredientChecklist` and `UnifiedIngredientList`.
  `matchesActiveAllergen` moved into `@carrot/shared/utils/allergenKeys` (mobile keeps its local copy).
  Linked allergens are shown only when they match the household's active allergens.
- Mobile: no per-ingredient (?) icon exists, so only in-app navigation and the linked-allergen label
  were added in `IngredientRow`.
- Related recipes refetch: `useRecipes` already invalidates the `['recipes']` prefix on every
  `recipe_changed` SSE event, which covers `['recipes', id, 'related']`; no change needed.
- Locale: only `recipes.fromLinkedRecipe` was added (en, pl, de, fr, es).
- Known limits: a child whose `allergen_status` is `unknown` (household has no allergens configured)
  stays unresolved; a child job whose parent was deleted loses `parent_recipe_id` (SET NULL) and
  would then spawn its own links.

## Problem

When an imported recipe has an ingredient that links to another recipe (e.g. "1 batch
[teriyaki sauce](https://…/teriyaki-sauce)"), extraction marks the parent
`allergen_status = "uncertain"` and the UI shows *"Allergen information is incomplete
because a linked component has unknown ingredients."* We never follow the link, so the
notice stays forever.

## Goal

1. When a recipe is imported with linked ingredients, automatically import each linked
   recipe (one level deep) into the same household.
2. Once a linked recipe is analysed, show its actual allergens on the parent's linked
   ingredient, and clear the "incomplete" notice when every link is resolved.
3. Add each linked recipe to the parent's related recipes.

## Non-goals

- Recursive importing (a child's own links are not followed; the child itself may stay
  "uncertain", which makes the parent's linked ingredient stay uncertain too).
- Changing extraction prompts or how `ingredient_links` are detected.
- Backfilling existing recipes automatically (the reimport script can do that later).

## Data model

All in `services/api/src/api/models.py`, with idempotent `ALTER TABLE … IF NOT EXISTS`
statements added next to the existing ones in `services/api/src/api/main.py` (there is no
Alembic).

- `ImportJob.parent_recipe_id: UUID | None` — FK `recipes.id`, `ondelete="SET NULL"`.
  Marks a job as a child import spawned for a parent's linked ingredient.
- Component JSON gains `linked_recipe_ids: list[str | None]`, parallel to
  `ingredient_links` (same length; `None` when unresolved/no link). Mirror on
  `Component`/save/out pydantic models that already carry `ingredient_links`, and in
  `packages/shared/src/types.ts`.
- `AllergenFlag` gains `linked_allergens: list[str] | None` (pydantic + TS). Holds the
  allergens found in the resolved linked recipe. Kept separate from `allergen` so
  rechecking the parent's own line never clobbers it, and vice versa.

## Backend flow

### 1. Spawning child imports (new module `services/api/src/api/services/linked_recipes.py`)

`async def spawn_linked_imports(session, parent: Recipe, job: ImportJob) -> None`, called
from `import_worker._process_job` right after `_save_recipe`, in the same transaction,
**only when `job.parent_recipe_id is None`** (depth limit = 1).

- Collect unique `http(s)` URLs from every component's `ingredient_links`; normalise for
  comparison (strip fragment, trailing slash, lowercase host). Skip a URL equal to the
  parent's `source_url`. Cap at 5 distinct URLs.
- For each URL:
  - If a recipe in `job.household_id` already has that normalised `source_url`, resolve
    immediately: write its id into the matching `linked_recipe_ids` slots and add the
    related-recipe row (see §3).
  - Otherwise insert an `ImportJob(kind=URL, input={"url": url}, user_id=job.user_id,
    household_id=job.household_id, parent_recipe_id=parent.id,
    idempotency_key=uuid5(NAMESPACE_URL, f"{parent.id}:{normalised}"))` with
    `on_conflict_do_nothing` on the `(user_id, idempotency_key)` unique constraint so
    retries/requeues never create duplicates. Emit the usual queued event so the child
    shows in the import list.
- If anything was resolved immediately, enqueue an allergen recheck for the parent
  (`enqueue_recipe_allergen_check`).

### 2. Child job completes

In `_process_job`, after a child job's recipe is saved (or if `current.result_recipe_id`
is already set on a retried child), call
`async def attach_child_to_parent(session, parent_id, child: Recipe, url)`:

- Lock the parent (`with_for_update`); return if it was deleted.
- Set `linked_recipe_ids[i] = child.id` for every ingredient whose normalised link equals
  the child's job URL. Reassign `parent.components` (new list) so SQLAlchemy persists JSON.
- Insert related-recipe row.
- `enqueue_recipe_allergen_check(session, parent.id)`.

Child job failure: nothing changes; parent stays "uncertain" (correct — we still don't
know).

Child jobs must not send a push notification (avoid "Recipe imported" spam for components);
skip push in `_deliver_pushes` when the event's job has `parent_recipe_id`. SSE events stay
so lists refresh.

### 3. Related recipes

Reuse the existing table: insert
`{"recipe_id": min(a, b), "related_recipe_id": max(a, b)}` with `on_conflict_do_nothing`
(same as `set_related_recipes` in `routes/recipes.py`; extract a small shared helper
rather than duplicating). Skip when parent id == child id.

### 4. Allergen status computation (single helper, used everywhere)

In `linked_recipes.py`:

```python
async def resolve_linked_allergens(session, components) -> tuple[list[dict], str]
```

- Load all recipes referenced in `linked_recipe_ids` (one query).
- For each ingredient with a link:
  - resolved recipe exists **and** its `allergen_status == "analyzed"` →
    `flag["linked_allergens"] = sorted unique non-null allergens across that recipe's
    ingredient_flags (its own `allergen` + its `linked_allergens`)`;
  - otherwise → `flag["linked_allergens"] = None` and the ingredient counts as unresolved.
- Status: `"uncertain"` if any link is unresolved, else `"analyzed"`.

Use it in:
- `allergen_rechecks._process` — replace the current "any link ⇒ uncertain" line.
  Keep the pre-existing flag-merging (preserve `linked_allergens` via the `**previous`
  spread already there, then overwrite with fresh values from the helper).
- After a recipe's recheck succeeds **and its allergen summary changed**, enqueue rechecks
  for parents that reference it (candidates from the related-recipes table, filtered to
  those whose `linked_recipe_ids` contain the id). The "changed" guard prevents A↔B loops.
- Import-time status (gemini.py) stays as-is: links are unresolved at that moment, so
  "uncertain" is correct.
- A deleted child ⇒ id no longer loads ⇒ unresolved ⇒ "uncertain" (no extra cleanup
  needed).

Recipe save/edit route (`routes/recipes.py`): when components are saved, carry
`linked_recipe_ids` through the existing `_reconcile_component_derivatives` the same way
`ingredient_links` is carried (if an ingredient line's link changes, drop its id).

## Frontend

`packages/shared/src/types.ts`: add `linked_recipe_ids?: (string | null)[]` to the
component types that have `ingredient_links`, and `linked_allergens?: string[] | null` to
`AllergenFlag`.

Web (`apps/web/src/components/RecipeDetailModal/IngredientChecklist.tsx`,
`UnifiedIngredientList.tsx`) and mobile
(`apps/mobile/src/screens/RecipeDetailScreen/UnifiedIngredientsSection.tsx` and its row):
- Show the uncertain (?) icon on a linked ingredient only when that ingredient is
  unresolved (no `linked_allergens`), not merely because `recipe.allergen_status` is
  uncertain.
- When `linked_allergens` is non-empty, render them using the same allergen badge/style
  used for normal `flag.allergen` — prefixed with the existing allergen label pattern.
  Empty list ⇒ no badge (child analysed, no allergens).
- When `linked_recipe_ids[i]` is set, the link opens that recipe in-app (web: same
  mechanism the related-recipes popup uses; mobile: navigate to RecipeDetail) instead of
  the external URL.
- Related recipes section already reads `/recipes/{id}/related`; ensure it refetches on
  the recipe-changed SSE event so the child appears without reload.

Translations: any new string (e.g. "From linked recipe") goes into en, pl, de, fr, es.

## Repeated actions / idempotency

- Deterministic `idempotency_key` + `on_conflict_do_nothing` → retries and requeued parent
  jobs never spawn duplicates.
- `attach_child_to_parent` is idempotent (setting the same id, related insert ignores
  conflicts, recheck enqueue coalesces).

## Tests (`services/api/tests/test_linked_recipes.py`)

- URL normalisation + dedupe + cap + self-link skip.
- `resolve_linked_allergens`: unresolved, resolved-analysed (with/without allergens),
  resolved-but-uncertain child, deleted child.
- Spawn is skipped for child jobs (depth limit).
- Existing household recipe with same source URL is reused, not re-imported.
- Recheck propagation guard: unchanged child summary does not enqueue parent.

Follow the style of existing tests in `services/api/tests/` (check whether they use a real
DB or stubs and match it).

## Verification

- `cd services/api && uv run pytest`
- `pnpm -r typecheck` (or the repo's equivalent lint/typecheck scripts) for web, mobile, shared.
