# Reduce Recipe Extraction Hallucinations

## Goal

Cut the two recurring extraction defects reported on Gemini `2.5-flash-lite`: (1)
ingredients that do not appear in the source, and (2) quantities that differ from the
stated amounts. Do this without indiscriminately upgrading every call to a larger, slower,
more expensive model. Keep the cheap mechanical calls (shopping-list values, unit
conversion) on `flash-lite`; strengthen only the faithful-extraction path.

## Diagnosis

Two distinct failure modes with different fixes:

1. **Overloaded single prompt.** `_SYSTEM` in `services/api/src/api/services/gemini.py`
   asks one small-model call to simultaneously extract faithfully, convert units into two
   parallel metric/imperial variant arrays, estimate nutrition, estimate servings, assign
   tags, detect allergens, compute `step_refs`, and round shopping-list values. On a weak
   model this cognitive load blurs the boundary between copying and generating, so
   fabrication leaks into the extraction itself.
2. **The prompt explicitly instructs invention.** Nutrition (`kcal_per_serving` et al.) is
   `REQUIRED ... estimate based on the ingredients`, servings falls back to `estimate`, and
   unit conversion invents gram values. These are legitimate features, but a small model
   does not cleanly quarantine "estimate the nutrition" from "do not add ingredients."

Additional contributing factors:

- The actual model is `gemini-2.5-flash-lite`, set by the per-import setting default
  (`models.py:550`, `models.py:568`) and the pipeline defaults (`pipeline.py:134`, `:214`,
  `:377`). The `_DEFAULT_MODEL = "gemini-2.5-flash"` in `gemini.py` is always overridden and
  is therefore misleading.
- No `temperature` is set on any `GenerateContentConfig`, so extraction runs at the API
  default sampling temperature, which increases fabrication.

## Decisions

| Topic | Decision |
|---|---|
| First lever | Prompt + sampling changes, not a blanket model upgrade. |
| Anti-hallucination clause | Add an explicit "only extract what is present; never add ingredients; never change stated numbers; estimation permitted only for nutrition/servings" instruction to `_SYSTEM`. |
| Temperature | Set `temperature=0` on the faithful-extraction calls (`extract_recipe`, `extract_recipe_from_image`). |
| Extraction model | Route the extraction call to `gemini-2.5-flash`, independent of the user-selected import model. Keep `flash-lite` for shopping-list and unit-conversion calls. |
| Model config | Introduce a dedicated extraction-model setting so the extraction model is not coupled to the DB per-import `model` field. |
| Split (optional, later) | Consider separating faithful extraction from estimation/conversion into distinct focused calls if defects persist after the above. Not required for the first pass. |
| Evaluation | Hallucination is stochastic; judge changes against a fixed set of hand-verified recipes, not one-off imports. |

## Changes

### 1. Anti-hallucination clause (`gemini.py` `_SYSTEM`)

Prepend a clear constraint near the top of `_SYSTEM`:

> CRITICAL: Only extract ingredients, quantities, and steps that are explicitly present in
> the source text. Never add an ingredient that is not mentioned. Never change a number
> that is stated — copy quantities exactly as written. Estimation is permitted ONLY for
> nutrition and servings when they are not stated, and ONLY in those fields — never for
> ingredients or their amounts.

This directly targets both reported symptoms and costs nothing at runtime.

### 2. Temperature

Add `temperature=0` to the `GenerateContentConfig` for `extract_recipe` and
`extract_recipe_from_image`. Leave the mechanical calls unchanged unless they later show
drift.

### 3. Dedicated extraction model

- Add an extraction-model setting (e.g. `settings.gemini_extraction_model`, default
  `gemini-2.5-flash`) so faithful extraction is decoupled from the user-selected import
  `model`.
- Wire the pipeline's extraction entry points to pass the extraction model to
  `extract_recipe` / `extract_recipe_from_image`, while the shopping-list and unit-variant
  calls continue to use the existing `flash-lite` default.
- Remove or correct the misleading `_DEFAULT_MODEL` in `gemini.py` so the real defaults are
  not obscured.

### 4. Optional follow-up: split extraction from transformation

If defects persist after 1–3, restructure so the first call performs only faithful
extraction (title, ingredients as written, steps, and servings/nutrition only when
literally stated). Then run unit variants, nutrition estimation, allergens, and
`step_refs` as follow-up calls over the already-extracted structured data. Smaller,
single-purpose prompts hallucinate less. `estimate_unit_variants` already establishes this
pattern.

## Verification

- Assemble ~10 known recipes with hand-verified ingredient lists and quantities.
- Diff extraction output against the ground truth before and after the change; measure the
  rate of extra ingredients and altered quantities rather than judging from a single
  import.
- Confirm extraction runs on `gemini-2.5-flash` while shopping-list and unit-conversion
  calls remain on `flash-lite`.
- Run the API test suite; ensure tests do not require live import credentials.

## Out of scope

- Blanket upgrade of every Gemini call to `flash` or `pro`.
- Changes to the shopping-list, allergen, or unit-conversion prompts beyond model routing.
- Any client-facing UI changes.
