# Allergen status: no-allergen owners and post-save link resolution

Status: implemented, awaiting review

Follow-up to [linked-recipes-personal-library](linked-recipes-personal-library.md).

## Problem

1. When the recipe's owner has no allergens configured (household with empty `allergens`, or a
   personal-library recipe whose author has empty `personal_allergens`), the allergen pass is skipped and
   the recipe is `allergen_status = "unknown"`. A parent then sees its linked child as `unknown` →
   unresolved → the parent is `"uncertain"` and shows "Allergen information is incomplete", although there
   is nothing to check. Prod: Weronika has no personal allergens; her personal "Shredded Buffalo Chicken
   Wraps" (`8f6b3ed8…`) stays uncertain although both linked children imported. The personal library has
   55 `unknown`, 11 `uncertain`, 9 `analyzed` recipes (the non-unknown ones are household-era leftovers).
2. Import-time status (`gemini` enrichment / `_save_recipe`) sets `"uncertain"` whenever a recipe has any
   ingredient link, and nothing re-evaluates it after save. Links that turn out to be external, self-links
   (dropped on save) or already resolvable keep the recipe `"uncertain"` forever (prod: new imports
   "How to cook rice", "Taco Seasoning Recipe", "Instant Pot Yogurt").

## Design

Single rule, applied in one helper used by the allergen recheck worker
(`services/api/src/api/services/allergen_rechecks.py`), import save (`import_worker._save_recipe`,
`_replace_recipe`), and `recipe_reextraction.apply_extraction`:

- Determine the recipe's effective active allergens the same way the allergen pass does today (household
  allergens for household recipes, author's personal allergens for personal-library recipes; reuse the
  existing helper, e.g. `_get_tags_and_allergens` / the recheck's loader — don't invent a new source).
- No active allergens → `allergen_status = "unknown"`, skip `resolve_linked_allergens` (leave
  `linked_allergens` untouched or `None`), and don't enqueue parent propagation for this reason alone.
- Otherwise → status from `resolve_linked_allergens(components, source_url)` combined with the line flags,
  exactly as the recheck does now. At import save, if the recipe has any `"recipe"`-kind links, run this
  resolution right after saving (links are unresolved at that moment, so `"uncertain"` is still correct
  then); if it has none (only external/self links, or none at all), the status must not be `"uncertain"`
  just because of links.
- A parent with active allergens whose child is `unknown` because the child's owner has no allergens
  can't happen for same-owner children (they share the owner); leave the existing behaviour for that
  case.

Confirm that web and mobile show no "incomplete" notice for `"unknown"` (they key off `"uncertain"`); if
they do show something, report rather than change UI.

## Backfill

Add `--refresh-allergen-status` to `services/api/scripts/link_component_recipes.py` (dry run default,
`--apply`): for every recipe, compute the status with the helper above; for recipes whose owner has
active allergens and whose status would change, enqueue an allergen recheck instead of writing directly
(so flags are recomputed properly); for owners with no allergens, write `"unknown"` directly. Print the
per-recipe old → new status.

## Tests

- no-allergen household recipe and no-allergen personal recipe → `"unknown"`, linked resolution skipped.
- recipe with only external/self links and active allergens → not `"uncertain"` after save.
- recipe with an unresolved recipe link and active allergens → `"uncertain"` after save; becomes
  `"analyzed"` once the child is analysed (existing propagation).
- backfill dry run writes nothing; apply writes `unknown` for no-allergen owners and enqueues rechecks for
  the rest.

## Rollout

Deploy, then `uv run --no-sync python scripts/link_component_recipes.py --refresh-allergen-status`
(review), `--apply`.

## Implementation notes

- `allergen_rechecks.resolved_components_and_status` is the single rule (no allergens -> `"unknown"` and
  `resolve_linked_allergens` skipped, otherwise resolution); `settle_allergen_status(session, recipe)`
  applies it after a save using the recheck's `_allergens_for_recipe` loader. Called from
  `_save_recipe`, `_replace_recipe` and `scripts/reimport_recipes.py` (`apply_extraction` is sync and
  session-less, so the callers settle). The recheck worker uses the same rule and only propagates to
  parents when the allergen list changed if the owner has no allergens.
- `gemini.enrich_v2_recipe` no longer sets `"uncertain"` when no allergens are configured; with allergens
  it still sets a provisional status that `settle_allergen_status` overrides.
- Backfill: `--refresh-allergen-status` in `scripts/link_component_recipes.py`.
- Web (`RecipeNotices`, `RecipeViewLayout`, `RecipeEditLayout`) and mobile (`ReadView`) key only off
  `"uncertain"`; `"unknown"` shows no notice. No UI changes.
- The import-time pass analyses household + importing user's allergens, while the settle/recheck loader
  also includes other household members' personal allergens; a later recheck reconciles.
