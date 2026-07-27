# Refine recipe-import query boundaries

## Status

Pending.

## Context

Recipe import currently uses two Gemini calls:

1. A faithful extraction call on the configured extraction model.
2. An enrichment call on Flash Lite that generates unit variants, nutrition,
   tags, shopping-list values, allergen data, and ingredient-to-step references.

When a household has allergens configured, a third dedicated allergen-analysis
call runs after enrichment and overwrites its allergen data.

The split is sound: source extraction should be faithful, while calculations and
presentation-oriented conversions can be cheaper and allowed to estimate. The
implementation needs stronger boundaries so the enrichment call cannot alter the
faithful result.

## Goals

- Keep the original recipe source faithful and immutable after the first call.
- Generate metric and imperial variants without changing the canonical recipe.
- Remove duplicated allergen work.
- Detect and reject malformed or drifting enrichment responses.
- Keep the existing import result shape and user-facing behaviour unchanged.

## Non-goals

- Replacing Gemini or changing the configured extraction model.
- Adding deterministic ingredient-density conversions.
- Changing the supported canonical unit enum.
- Redesigning recipe editing or unit display in the clients.

## Design

### 1. Use a source-only response schema for query 1

Replace the reuse of the full `RecipeComponent` model in
`RecipeSourceExtraction` with dedicated source-only models.

The query-1 schema must include only:

- title
- servings
- components: role, name, yield note, ingredients (`qty`, `unit`, `name`), and
  steps

It must not expose variant ingredients/steps, shopping-list values, allergen
fields, tags, nutrition, or step references. This makes the response schema
match the faithful-extraction prompt and prevents accidental enrichment in the
first call.

Unsupported units must remain unparsed in `name`, with `qty` and `unit` set to
`null`, as the existing extraction prompt requires.

### 2. Treat query-1 fields as immutable in query 2

The enrichment input is the source-only result. Query 2 may add only:

- `metric_ingredients`, `imperial_ingredients`
- `metric_steps`, `imperial_steps`
- `shopping_list_value`
- nutrition estimates
- selected existing tags
- `step_refs`

Canonical title, servings, component metadata, ingredient quantity/unit/name,
and steps belong to query 1 and must not be returned as editable values from
query 2.

Remove the query-2 instructions to split ingredient fields or convert unsupported
units in the canonical recipe. Those instructions contradict the requirement that
query-1 data is authoritative. All unit transformations belong exclusively in
the parallel variant fields.

### 3. Keep allergen analysis as a conditional third query

Continue using the dedicated allergen query when allergens are configured; it
has the more specific substitution rules and can revise measurements for a
culinarily appropriate substitute.

Remove allergen input and allergen-output fields from query 2, along with its
allergen instructions. This avoids paying for and then overwriting duplicate
allergen classification.

The expected call count becomes:

| Household configuration | Calls |
| --- | --- |
| No allergens | extraction, enrichment |
| Allergens configured | extraction, enrichment, allergen analysis |

### 4. Validate enrichment before assembling the final recipe

Introduce a function that combines `RecipeSourceExtraction` and the enrichment
response. It must verify, for each component:

- the response has exactly the same component count and order;
- every variant ingredient list has exactly one entry per source ingredient;
- every variant step list has exactly one entry per source step;
- each step reference has an in-range source step and ingredient index.

The combiner, rather than the model response, must supply every canonical field
from query 1. If validation fails, raise a clear error so the existing import
failure/retry handling applies; never silently accept a partial or reordered
variant result.

### 5. Consolidate conversion behaviour

`estimate_unit_variants()` remains needed for the backfill script, but it should
reuse the same conversion-only schema and system instruction as query 2. Ensure
it uses `temperature=0` and can participate in usage tracking where appropriate.

Do not have two independent conversion prompts that gradually produce different
variant formats or rules.

### 6. Honour explicit model overrides

Thread the `model` parameter from import entrypoints through to
`extract_recipe`/`extract_recipe_from_image`, using the configured model only as
the default. This preserves the production default while making explicit caller
overrides real and testable.

## Implementation outline

1. Add source-only and enrichment-only Pydantic response models in
   `services/api/src/api/models.py`.
2. Update the extraction and enrichment prompts and their `response_schema`
   values in `services/api/src/api/services/gemini.py`.
3. Add the validated source-plus-enrichment combiner and use it from both text
   and image extraction paths.
4. Remove allergen handling from the enrichment request; retain the existing
   dedicated allergen stage only when allergens are supplied.
5. Make `estimate_unit_variants()` reuse the conversion contract.
6. Pass explicit `model` arguments through the pipeline instead of discarding
   them.
7. Update the backfill script for any narrowed variant response model.

## Tests

- Query 1 uses the source-only schema and cannot request enrichment fields.
- Query 2 uses the enrichment-only schema and receives the source result.
- The assembled recipe retains query-1 title, servings, components, canonical
  ingredients, and steps exactly.
- A mismatched component count, ingredient count, step count, or invalid step
  reference raises an error.
- Imports without allergens make two Gemini calls; imports with allergens make
  three and only the dedicated call supplies allergen results.
- `estimate_unit_variants()` uses deterministic sampling and the shared
  conversion contract.
- A supplied import model reaches the extraction call; no supplied model uses
  `settings.gemini_extraction_model`.

## Acceptance criteria

- Enrichment cannot overwrite any canonical source-owned field by construction.
- Unit variants are still produced for every component and remain aligned with
  the canonical ingredient and step arrays.
- Allergen analysis runs once, only when allergens are configured.
- Invalid enrichment responses fail the import instead of producing a corrupted
  recipe.
- Existing client payloads remain compatible.
