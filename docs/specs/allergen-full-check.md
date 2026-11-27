# Allergen check: run once against every allergen, filter per person

Status: pending

## Why

Today Gemini is asked only about the allergens currently selected for a recipe's audience: the author, every household the recipe is in, and every member of those households (`_allergens_for_recipe` in `services/api/src/api/services/allergen_rechecks.py`). Because the result depends on who is looking:

- Every allergy change re-runs Gemini on every affected recipe (`enqueue_user_allergen_checks` / `enqueue_household_allergen_checks`). That costs about one call per recipe component per change, and the user sees "checking recipes…".
- Joining or leaving a household, or sharing a recipe, changes the set and needs a recheck.
- `_IngredientFlag.allergen` is a single `str | None`, so an ingredient that contains gluten **and** milk can only report one of them.
- The comment in `packages/shared/src/utils/allergenKeys.ts` ("the backend always checks recipes against this full list, regardless of user preferences") is wrong today. This spec makes it true.

## Goal

1. **One full check per recipe.** Check each ingredient against **all** keys in `ALLERGENS` (`services/api/src/api/constants.py`: EU-14 + 10 intolerances) and store every allergen it contains.
2. **Filter per person, on the device.** Banners, badges, "N avoided" and swap prompts are computed in the app from the stored allergens and the viewer's selection. Changing allergies never calls Gemini.
3. **Run only when someone needs it.** A recipe gets checked only if someone who can see it avoids at least one allergen.
4. **Re-check only edited lines.** Changing an ingredient's name, or adding an ingredient, re-checks just those lines. Changing amount or unit never triggers a check.
5. **Show when a check is running.** A recipe whose check is in progress shows the "not sure yet" banner. An edited ingredient being re-checked shows a small "checking" indicator on its row.

## The "needs a check" rule

Implement this as a single rule rather than a list of special cases:

> A recipe needs a check when its **audience** avoids at least one allergen **and** its current ingredients have no completed full check.

- **Audience:** the recipe's author plus every member of every household the recipe is in (the same people as `_allergens_for_recipe` today).
- **Avoids at least one allergen:** any of them has non-empty `personal_allergens`, or any of those households has non-empty `allergens`.
- **Has a completed check:** every ingredient line has a full-check result for its current text (see *Storage*).

Evaluate the rule (`ensure_allergen_checks(session, recipe_ids)`) on these events, which together cover every case:

| Event | Recipes evaluated |
|---|---|
| Recipe imported / created / bulk-imported / copied from public | that recipe |
| Recipe shared into a household (`PUT /recipes/{id}/households`) | that recipe |
| Household `allergens` goes from empty to non-empty | all recipes in that household |
| A user's `personal_allergens` goes from empty to non-empty | all recipes they authored + all recipes in their households |
| A user joins a household (code, invitation accept) | all recipes in that household, plus the joining user's own recipes if the household avoids anything |
| Ingredient lines edited | only the changed lines (see *Edits*) |

Changes after the first allergen (adding a second one, removing some, removing all) evaluate nothing and call no Gemini. Results are **never deleted** when allergens are removed. They are already paid for and are reused if allergens come back.

A recipe whose audience avoids nothing is not checked at import. Its `allergen_status` stays `unknown`, and that is correct because nobody is warned about anything.

## Storage

Per ingredient flag (`ingredient_flags[i]` in `components`, type `AllergenFlag` in `packages/shared/src/types.ts`):

- Add `allergens: string[] | null`. That is every `ALLERGENS` key the line contains. `null` means not checked yet, and `[]` means checked and clean.
- Add `checked_text: string | null`. This is the ingredient's **name** (not the full line) that the result belongs to (see *Edits*). A flag counts as current when `checked_text` equals the line's current parsed name.
- Keep the existing `allergen` field during the migration, filled with the first entry of `allergens`, so old app builds keep working. Remove it once all clients read `allergens`.
- Keep `substitute*`, `original_display`, `original_values`, `linked_allergens`, and `ingredient_name` as they are.

Recipe level:

- `allergen_status`:
  - `unknown`: no audience allergens and never checked
  - `checking`: a check is queued or running
  - `uncertain`: checked, but an unresolved recipe link remains (today's meaning, from `resolve_linked_allergens`)
  - `analyzed`: every line is current

  Add `checking` and handle it everywhere `uncertain` is read today: mobile `ReadView.tsx:128` / `AllergenSummaryBox.tsx`, web `RecipeNotices.tsx`, `RecipeViewLayout.tsx`, `RecipeEditLayout.tsx`, and `linked_recipes.resolve_linked_allergens`, which must treat a `checking` linked recipe like an unresolved one.
- `recipe_allergens(...)` in `linked_recipes.py` reads the new `allergens` lists, so a parent recipe's linked allergens are also the full set.

## Gemini call

- In `services/api/src/api/services/gemini.py`, change `analyze_allergens` to always send the full `ALLERGENS` list (drop the `allergens` parameter). `_IngredientFlag` gets `allergens: list[str]` instead of `allergen: str | None`. Update `_ALLERGEN_SYSTEM` to report **every** matching allergen per ingredient, keeping the "reliable evidence only" rules and `_discard_unsubstantiated_allergen_flags`. Validate that returned keys are in `ALLERGENS` and drop any that aren't.
- **Drop `substitute` from this call.** Substitutes depend on what the viewer avoids, so they move to an on-demand call (see *Substitutes*).
- Allow a partial-line mode: the same function called with just the edited lines. It is the same prompt with fewer ingredients.
- **Accuracy check before rollout:** run the new prompt over the fixtures in `tools/extraction-review` and compare against current single-allergen results. A 24-allergen prompt must not lose precision (watch for false gluten on sauces, which the current system prompt guards against). Record the results in this spec.

## Edits (ingredient lines)

Currently `update_recipe` (`routes/recipes.py:671`) marks the whole recipe `unknown` and re-queues a full check whenever any ingredient string changes. `_merge_ingredient_flags` blanks the flag of any changed line.

New behaviour:

- **Classify each edited line by its parsed name.** Use the server-side ingredient parser (`services/ingredient_parser_v2.py`, which is the same parsing that fills `ingredient_name`) to split quantity/unit from name. Compare the normalised name (casefolded, whitespace-collapsed) to the flag's `checked_text`.
  - **Name unchanged** (only amount/unit edited): keep the flag as is and run no check.
  - **Name changed, or new line:** set that line's `allergens = null` and queue a **line check** for just those lines.
  - **Line deleted:** its flag goes with it, and no check runs.
  - **Substitution applied/restored:** keep today's handling in `_merge_ingredient_flags` (`original_display`). The allergens of the original are already known.
- Line checks only run if the recipe's audience avoids at least one allergen (the same rule). Otherwise the line just stays `null` until a full check is ever needed.
- While any line is `null` and a check is queued or running, `allergen_status = checking`.
- **Queue:** reuse `recipe_allergen_checks` (it already coalesces and uses revisions). Add `line_scope: JSON | null` (component index → line indexes). `null` means a full check. Merging a pending line-scope with a new request takes the union. A full request overrides any line scope. `_process` checks only the scoped lines and keeps its existing revision and snapshot guard, with the snapshot made per scoped line.
- **Repeat-safe:** rapid consecutive saves coalesce into one pending row (as today). A save that lands mid-check bumps the revision and the stale result is discarded.

## Substitutes (on demand)

- A new endpoint, e.g. `POST /recipes/{id}/substitutes`, takes `{component, line, avoid: string[]}` and returns a substitute suggestion for that line that avoids every allergen in `avoid` and the line contains.
- Cache by `(normalised ingredient name, sorted avoid set)` in a small table, so the same "butter / milk" request is answered once for everyone.
- The mobile swap sheet (`RecipeDetailScreen/IngredientSwapSheet.tsx`, `SwapChip.tsx`, `swapHelpers.ts`) and the web equivalent request the substitute when the sheet opens, with a loading state and an error state. They are guarded against repeated taps by an in-flight request per line.
- Applying a substitute keeps today's flow (`substitute_applied`, `original_display`, `original_values`).

## UI

### Recipe banner (mobile + web)
- `allergen_status === 'checking'` shows the existing "not sure yet" banner (`recipes.allergenSummaryIncompleteTitle` / `allergenSummaryIncomplete`). Add wording for the checking case, e.g. "Checking for allergens…", and keep the existing wording for `uncertain` (unresolved links). When both apply, show the checking wording.
- When the check finishes, the live `recipe changed` push (already sent by `_publish_recipe_changed`) refreshes the recipe and the banner settles to its final state with the existing animation patterns.

### Ingredient row indicator (mobile + web)
- An ingredient whose `allergens === null` while the recipe is `checking` shows a small inline "checking" indicator on its row: a compact `ActivityIndicator` (mobile) or spinner (web), with accessibility label "Checking for allergens". It appears in both read and edit views.
- When the line check completes, the indicator fades out (`exitFade`). If allergens were found, the badge fades in. It respects Reduce Motion via `useMotion()`.
- Reuse the existing allergen badge slot on the row (`AllergenBadge.tsx` / `IngredientRow.tsx`) and add a `checking` variant rather than a separate element.

### Filtering
- `collectMatchedAllergens`, `useIngredientAllergenLabels`, `getAllergenName`, the badges and "N avoided" all read `allergens` (plural) and intersect it with the viewer's active allergens: personal + active household, as today. Build this as one shared helper in `packages/shared/src/utils/allergenKeys.ts`, used by mobile and web.
- An ingredient with several matching allergens shows them all, joined with short labels (`allergenShortLabel`).

### Allergies settings screen
- Remove the recheck polling (`useAllergenSelection.ts`, `RECHECK_POLL_MS`, the recheck status line in `AllergenSummary.tsx`) for ordinary changes.
- When the change is the **first** allergen (it triggers a run), show a one-off non-blocking line, e.g. "Checking your recipes for allergens — this runs in the background", driven by the existing `/recipes/allergen-recheck-status` endpoint. Keep that endpoint, but it now only reports first-run and backfill progress.

## Backfill (existing recipes)

- Resumable, batched script in `services/api/scripts/` (follow `backfill_recipe_embeddings.py`): for every recipe whose audience avoids something, queue a full check. Recipes with no audience allergens are skipped.
- Run with `--batch-size`, repeat until `queued=0`, same as the embeddings rollout. Document it in the README next to the semantic search rollout.
- Until a recipe is backfilled it keeps its old `allergen` value. The shared filter helper treats `allergens == null && allergen != null` as `[allergen]` so nothing disappears during rollout.

## Cleanup

- Delete `enqueue_user_allergen_checks` / `enqueue_household_allergen_checks` as "recheck on every change" paths. Replace them with `ensure_allergen_checks` on the transitions listed above.
- `_allergens_for_recipe` becomes `recipe_audience_avoids_anything(session, recipe) -> bool`.
- Fix the comments in `packages/shared/src/utils/allergenKeys.ts` and `services/api/src/api/constants.py` (which points at a non-existent `packages/shared/src/constants/allergens.ts`).
- `docs/TODO.md`: remove "Make the allergen pass opt-in". This spec replaces it.

## Translations

New strings (checking banner, row indicator accessibility label, first-run notice, substitute loading and error) go in all 7 locales: en, pl, de, fr, es, it, pt.

## Tests

API (pytest):
- The rule: a recipe is checked iff its audience avoids something. Covers import, share, first allergen (household and personal), and join.
- A second, removed, or all-removed allergen triggers no queue rows.
- Edits: amount/unit change → no check, flags unchanged. Name change → line-scope check only for that line. New line → line check. Delete → no check.
- Queue coalescing: line scopes union, full overrides line, a stale revision is discarded.
- `analyze_allergens` returns multiple allergens per line and drops unknown keys.
- Substitute cache hit and miss.

Clients: typecheck mobile and web. Manually verify the banner, the row indicator and the multi-allergen badges in light and dark.

## Rollout order

1. DB columns (`ingredient_flags` fields are JSON, so no migration; `recipe_allergen_checks.line_scope`; substitute cache table) + API with the backward-compatible `allergen` field.
2. Clients read `allergens` with a fallback to `allergen`, and handle `checking`.
3. Backfill.
4. Remove the legacy `allergen` field and the old recheck paths.
