# Spec: Cross-component step → ingredient lines, plus backfill

Status: pending. Branch `feat/recipe-live-updates-edit-lock`.

## Problem
Cook mode, on both mobile and web, positions a "you're about here" marker or rail using `step_ingredient_line`: one ingredient index per step, **in the step's own component**. Import often puts all the steps in a separate component with no ingredients. Example: "Thai Grilled Chicken (Gai Yang)" (`e58c9eaf…`, `fbbd9dbc…`) has 4 ingredient-only components (Main, Marinade, Sauce options, Garnishes) and one unnamed component with 5 steps and 0 ingredients, so every line is `null`. In production, only 104 of the 226 components that have steps have any line at all.

Background: read `docs/specs/completed/cook-mode-ingredient-rail.md` first. The premise still holds: **one approximate position per step**, grounded in the step text, with `null` when unsure.

## Data model (backward compatible)
- Keep `step_ingredient_line: list[int | None]`.
- Add a parallel `step_ingredient_component: list[int | None] | None` on the component, in `models.py` (the stored and save models), `recipe_components.py`, and the shared TS types (`packages/shared/src/types.ts`).
- Meaning: when `step_ingredient_component[i]` is set, `step_ingredient_line[i]` indexes the ingredients of **that** component. When it is missing or null, the line indexes the step's own component (today's meaning). Existing data stays valid with no migration of old rows. Components are stored as JSON, so no SQL migration is needed; confirm this.
- Invalidation in `routes/recipes.py` (`_reconcile_component_derivatives`): today a component's lines are nulled when *its own* ingredients or steps change. They must now also be nulled when the ingredients of the component a step points into change, or when components are reordered, added or removed so that an index could shift. Null both fields together. Add tests next to `tests/test_recipe_step_line_invalidation.py`.

## Matching (`services/api/src/api/services/gemini.py`)
- `match_recipe_step_ingredient_lines` and `_step_match_prompt`: offer every step **all** ingredients of the recipe, each tagged with its `component_index` and `ingredient_index` (plus the component name, for context). Add `component_index` to `_StepIngredientReference`.
- Prefer the step's own component when it has a grounded match. Otherwise pick across components. Keep the "first referenced ingredient" rule for which single index is stored.
- `_validate_step_matches` / `_reference_is_grounded` / `_has_grounded_candidate`: check against the referenced component's ingredient. Keep the retry-once flow and the null-on-doubt behaviour.
- The function returns both lines and components per step. Update `_match_source_step_ingredient_lines_safely`, the import path that writes them (around line 544–616, `step_ingredient_lines` → also `step_ingredient_components`), and `match_step_ingredient_lines`.
- Update and add tests in `tests/test_gemini_extraction.py` (Gemini is mocked): a steps-only component that matches into ingredient-only components; own-component preference; ungrounded cross references rejected.

## Backfill (`services/api/scripts/backfill_step_lines.py`)
- Today the script skips components with no ingredients and only fills null or mis-sized lines. Change it so that:
  - A recipe is a candidate when any step-bearing component has all-null or missing lines, or `--force` is passed. Steps-only components now count.
  - It recomputes with the new matcher and writes both fields for every step-bearing component of the recipe in one commit, touching no other field.
  - The dry run (the default) prints how many recipes it would change, plus a per-recipe summary. `--apply` writes. `--recipe-id` limits the run to given recipes.
  - It is idempotent and safe to re-run, and works through recipes sequentially with a small concurrency or rate limit for Gemini.
- Running it: locally first (`docker compose exec worker uv run --no-sync python scripts/backfill_step_lines.py …`). **Production runs only after the user explicitly approves.**

## Clients — one shared resolver
- Add `resolveStepAnchors(components)` to `packages/shared/src/utils/` (for example `stepAnchors.ts`). It returns one `{ componentIndex, ingredientIndex } | null` per flattened step:
  - It uses `step_ingredient_component` when present and falls back to the step's own component.
  - It carries the last known anchor forward for steps without one.
  - It returns `null` before the first known anchor. This keeps the mobile behaviour the user just approved: no marker when the anchor is unknown.
  - Add unit tests if the shared package has a test setup. Otherwise cover it through the API or mobile code, and say so.
- Mobile: `apps/mobile/src/screens/CookModeScreen/helpers.ts` `resolveStepAnchorKeys` becomes a thin mapping over the shared resolver into the existing `${componentIndex}-${ingredientIndex}` keys.
- Web: `apps/web/src/components/RecipeDetailModal/helpers.ts` `resolveRailTargets` uses the shared resolver. It maps anchors to rail flat indices; with no anchor it keeps index 0, which is what web's rail does today.
- Check the "unit variant" ingredient lists (`metric_ingredients` / `imperial_ingredients`) keep the same indices as `ingredients`. They should; confirm.

## Done when
- The API tests pass (`cd services/api && uv run pytest`, at least the step-line, extraction and recipe tests).
- `npx tsc --noEmit` passes in `apps/mobile`, `packages/shared` and `apps/web`.
- A local backfill dry run, then `--apply`, on the Gai Yang recipes gives non-null anchors that point into Marinade, Sauce or Garnishes where the step text names them. Report what each step got.
- Production backfill: ask the user before running.
