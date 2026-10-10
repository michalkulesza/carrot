# Linked ingredient link kinds: recipe vs external

Status: implemented, awaiting review

Follow-up to [linked-recipes-backfill](linked-recipes-backfill.md).

## Problem

Ingredient links include shop/affiliate pages (`amzn.to`, `target.com/p/…`) and same-site pages that
aren't recipes (e.g. recipetineats "what-is-tomato-passata"). Since 09885c1 auto-spawn only follows
same-site links, but the rest of the system still treats every link as a linked component recipe:

1. Mobile labels every link "Open linked recipe"; web and mobile offer "Import linked recipe" for
   shop links.
2. `POST /recipes/{id}/linked-recipes` accepts cross-site URLs and queues a doomed import.
3. `resolve_linked_allergens` (`services/api/src/api/services/linked_recipes.py`) counts every link
   as unresolved until a recipe is attached, so recipes whose links are only shop links (prod: "Salmon
   Rice Bowl" `9b947bd1…`, "Honey Garlic Pork Tenderloin" `55fc7ca1…`) are `allergen_status =
   "uncertain"` forever and show "Allergen information is incomplete". A same-site non-recipe page
   whose child import fails with `no_recipe_content` does the same to its parent.

## Design

Components get a server-owned `ingredient_link_kinds: list["recipe" | "external" | None]`, parallel to
`ingredient_links` (None where there is no link). Mirror it on the pydantic component models next to
`linked_recipe_ids` and in `packages/shared/src/types.ts`.

- `"recipe"`: same-site as the recipe's `source_url` (reuse `_site` / same-site rule from
  `linked_urls`), not known to be a non-recipe page.
- `"external"`: cross-site, or a same-site link whose child import failed with `no_recipe_content`
  (also `unsupported_source`).

Computation (single helper in `linked_recipes.py`, e.g. `with_link_kinds(components, source_url,
non_recipe_urls=())`), applied wherever components are written: `serialize_components` callers in
import and re-import, the recipe save route's reconcile (`_reconcile_component_derivatives` in
`routes/recipes.py` — incoming values ignored, like `linked_recipe_ids`; an existing `"external"`
for the same normalised URL on the same line is preserved so a confirmed non-recipe stays external),
`set_linked_recipe_ids` keeps kinds as-is. `linked_urls` (auto-spawn) and the tap endpoint consider
only `"recipe"` links; the endpoint returns 422 for anything else.

Marking non-recipe: when a child job (auto-spawned or tap) reaches terminal failure with
`no_recipe_content` / `unsupported_source`, set that URL's kind to `"external"` on the parent (lock the
parent like `attach_child_to_parent`) and enqueue a parent allergen recheck. Tap-initiated children
still show their failed card (existing behaviour).

Allergens: `resolve_linked_allergens` only treats `"recipe"` links as linked components. `"external"`
links are ordinary ingredients: their own `flag.allergen` is used, `linked_allergens` is left `None`,
and they never make the status `"uncertain"`. Missing kinds (legacy data before backfill) → compute on
the fly from `source_url` inside the helper so behaviour is correct even before the backfill runs.

## Frontend

Web (`LinkedRecipeLink.tsx`, `UnresolvedLinkMenu.tsx`, `IngredientChecklist.tsx`,
`UnifiedIngredientList.tsx`) and mobile (`IngredientRow.tsx`, `UnifiedIngredientsSection.tsx`):
- kind `"external"`: label `recipes.openLink` ("Open link"), opens the URL directly (web: `<a
  target=_blank rel=noopener noreferrer>`; mobile: `Linking.openURL`), no import option, no (?)
  uncertain icon.
- kind `"recipe"`: current behaviour (resolved → in-app; unresolved → import / open website).
- kind missing: treat as `"recipe"` (server backfill fills it).

New locale key `recipes.openLink` in en, pl, de, fr, es.

## Backfill

Add `--refresh-link-kinds` to `services/api/scripts/link_component_recipes.py` (dry run default,
`--apply` writes): for every recipe with any `ingredient_links`, compute kinds (marking as
`"external"` the URLs of that parent's child jobs that failed with `no_recipe_content` /
`unsupported_source`), write them, and enqueue an allergen recheck for each changed recipe. Print per
recipe the changed kinds.

## Tests

- kind computation: same-site → recipe, cross-site/`www.` handling, non-recipe URL → external, None
  slots, legacy components without kinds.
- `resolve_linked_allergens`: only-external links → `"analyzed"` with own flags; mixed with an
  unresolved recipe link → `"uncertain"`.
- child terminal failure `no_recipe_content` marks parent link external and enqueues recheck; other
  failure codes don't.
- tap endpoint 422 on external link.
- save route preserves server kinds and ignores incoming.
- backfill dry run writes nothing; apply writes and enqueues rechecks.
- typecheck web/mobile/shared.

## Rollout

Deploy, then in `carrot-api-1`: `uv run --no-sync python scripts/link_component_recipes.py
--refresh-link-kinds` (review), then add `--apply`. Verify Salmon Rice Bowl and Honey Garlic Pork
Tenderloin become `analyzed`.

## Implementation notes

- `linked_recipes.py`: `with_link_kinds`, `link_kinds` (stored kinds, computed on the fly for legacy components), `external_urls`, `preserved_external_urls`, `recipe_link_urls`, `mark_link_external`; `linked_urls`, the tap endpoint and `resolve_linked_allergens(session, components, source_url)` consider only `"recipe"` links.
- Kinds are written in `_save_recipe` and `apply_extraction` (shared by `_replace_recipe` and `scripts/reimport_recipes.py`, which keeps previously external URLs) and in the save route via `_server_link_kinds`. `set_linked_recipe_ids` leaves kinds untouched.
- A recipe without a `source_url` has no own site, so all its links count as `"external"`.
- `_fail_or_retry` terminal branch calls `mark_link_external` for `no_recipe_content` / `unsupported_source` child failures (tap and auto-spawned).
- Backfill: `link_component_recipes.py --refresh-link-kinds [--apply]`; failed child jobs and already-external URLs stay external.
- Frontend: `IngredientLinkKind` in shared types, `recipes.openLink` in all 5 locales; web `LinkedRecipeLink` renders a plain `<a>` for external links and the checklist hides the (?) icon for them; mobile `IngredientRow` opens external links with `Linking.openURL`.
