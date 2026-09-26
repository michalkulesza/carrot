# Deterministic unit variants

Status: implementation complete; local runtime verified, production not verified.

## Problem and outcome

Imported recipes currently ask Gemini to write metric and US ingredient and step variants. Generate those variants in application code from the source recipe instead, so the result is repeatable and preserves the original recipe wording when conversion is uncertain. URL and pasted-text imports already enter through extraction v2; apply the converter to their output immediately. Image extraction can retain its existing source-extraction path while using the same converter for unit variants.

## Conversion rules

- Never convert a measurement from cups or to cups. Keep source cup quantities and units in both variants.
- Convert only recognized, dimensionally compatible weights, volumes other than cups, lengths, and temperatures. Preserve teaspoon and tablespoon measurements, counts, ingredient names, preparation notes, and recipe actions.
- Recognize a step temperature with any numeric value when it has a degree marker (`°` or `degree(s)`). Without a marker, recognize `C` only when its numeric value is at least 30; leave lower unmarked `C` values and unmarked `F` unchanged.
- Keep unknown, ambiguous, alternative, or unsupported measurements in their source wording in both variants. Do not estimate ingredient density or can weight.
- Keep metric and US ingredient and step arrays aligned one-to-one with the canonical source arrays. Do not change the canonical source text.
- Generate variants for all import paths that currently persist them. Remove Gemini prompts, validation, repair, and standalone backfill code used only for unit conversion when replaced or unused; retain unrelated Gemini enrichment and source extraction.
- Suppress the extra metric-view cup hint when the metric ingredient itself already contains that cup quantity; retain the hint for older recipes whose metric text has no cup measurement.

## Approach and review

- Build on the existing ingredient parser for recognized quantities. Convert measurements in step text conservatively; unknown spans remain intact.
- Apply one server-side converter after source extraction and before persistence so the display preference continues to select stored variants.
- Keep unsupported structured units such as `fl oz`, `qt`, `inch`, and `cm` as full canonical source lines when the existing ingredient enum cannot represent them; convert their display variants from those lines.
- Review the diff for stale Gemini conversion code, correct fallback handling, and cup preservation in both directions. Record any source patterns the converter intentionally leaves unchanged.

## Verification

Manual review covered alignment, conversion direction, cup preservation, and import-path coverage. Python syntax parsing and `git diff --check` passed. Automated tests and runtime import checks were not run. The local worker was rebuilt with the converter; the backfill repaired a newly imported recipe with identical stored variants, and the database now contains distinct metric and imperial ingredient arrays for that recipe.

## Known limits

The converter leaves ambiguous, compound, and non-leading measurements unchanged. Some accented unit spellings are not covered by its source-span matcher and remain unchanged. The backfill script preserves distinct stored variants and repairs missing variants or identical variants that still match the canonical source arrays.
