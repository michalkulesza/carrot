# Unit and amount parser v2

Status: complete. The reviewed parser is connected to active text and image recipe ingestion.

## Goal

Split each source ingredient line into its amount (`qty`), canonical unit (`unit`), and remaining ingredient text (`name`) while preserving the source's meaning. Do not invent an amount or unit. Keep the original line as evidence and represent uncertainty explicitly.

## Proposed output

Keep the original `source_text` beside parser fields. Store stable canonical unit identifiers in English in the database; unit identifiers are singular (or established abbreviations such as `tsp`). Localize the display label in the app according to the viewer's locale, using the quantity to select a singular or plural form where the language requires it.

| Field | Meaning |
|---|---|
| `qty` | Amount as text, normalized without losing precision. Convert decimal commas to decimal points (for example `1,2` to `1.2`). Keep metric amounts (`g`, `kg`, `ml`, `cl`, `l`) and US weight amounts (`oz`, `lb`) as decimals. For US volume measures (`cup`, `tbsp`, `tsp`), convert to a common fraction only when the value matches exactly (for example `1,5` to `1 1/2`); otherwise preserve the decimal value and precision. Normalize range connectors to a compact hyphen (for example `1 to 2` to `1-2`). Exact additive quantities may be combined when their units have a clear conversion (for example `1 tablespoon plus 1 teaspoon` to `1 1/3` tablespoons). Null when no amount is stated. |
| `unit` | Singular canonical application identifier when the source expression maps unambiguously (for example `sheets` → `sheet`; Polish `litra` → `l`, `szklanki` → `cup` in the reviewed recipe context, and `liście` → `leaf`; French `cuillère à café` → `tsp`; `teaspoons` → `tsp`; `tablespoons` → `tbsp`; `ounces` → `oz`; and `pounds`/`lbs` → `lb`); otherwise retain the source unit expression and mark the result partial. Null when no unit is stated. |
| `name` | Ingredient description after a confidently recognized amount and unit; preserve descriptors and preparation notes. If splitting is uncertain, retain the complete source line in `name`. |
| `status` | `parsed`, `partial`, or `uncertain`, so missing and ambiguous parses are visible. |

The benchmark records expected fields independently of runtime types so it can expose schema gaps. Canonical IDs `oz`, `lb`, `leaf`, and `sheet` have been added to the application unit schema. Keep unit IDs singular; localize and pluralize their displayed labels based on quantity. For any other unsupported source unit, retain the original line and mark the result partial until its support is decided. Keep the full original `source_text` as evidence when normalizing an inflected, translated, or abbreviated unit.

## Labeling rules

- Copy `source_text` exactly from the reviewed extraction expectation.
- Label only what the line explicitly states. A bare ingredient such as `salt to taste` has null `qty` and `unit`; do not infer a pinch or other amount.
- Preserve amount meaning and precision. Convert decimal commas to decimal points (for example `1,2` to `1.2`). Keep metric (`g`, `kg`, `ml`, `cl`, `l`) and US weight (`oz`, `lb`) amounts as decimals. For US volume measures (`cup`, `tbsp`, `tsp`), normalize to a common fraction only when the value matches exactly, without rounding (for example `1,5` to `1 1/2`, `0,25` to `1/4`); leave other decimals as decimal points. Normalize `to`, en dash, and em dash range separators to a hyphen without surrounding spaces (for example `1 to 2` to `1-2`). Keep approximation wording out of `qty`; record it in `reviewer_note` when relevant, and retain the exact wording in `source_text`.
- Combine additive quantities only when the units have an exact, established conversion within the same measurement dimension. For example, `1 tablespoon plus 1 teaspoon` is `1 1/3` tablespoons (3 teaspoons equal 1 tablespoon). Do not convert between weight and volume or guess ingredient-specific equivalences. Keep the untouched full `source_text` as evidence for every normalized result.
- Normalize inflected, translated, plural, or abbreviated unit forms to a singular canonical application identifier only when the mapping is unambiguous. Unit identifiers are independent of the recipe's source language and the viewer's locale; translate and inflect their display labels in the app using the quantity. Keep the full original line as evidence of the exact source wording. If no canonical mapping is clear, retain the source unit expression and flag the schema gap in `reviewer_note`; if no unit is stated, use null.
- Do not change quantity magnitude when recognizing a foreign unit. For example, Polish `1,2 litra` becomes amount `1.2` with unit `l`; do not convert it to milliliters or US units. Unit-system conversion is a separate user-preference feature.
- Keep count and size descriptors distinct from units where appropriate. For example, `2 large eggs` has amount `2`, no unit, and name `large eggs`; `2 cloves garlic` has amount `2`, unit `cloves`, and name `garlic`.
- Preserve preparation details in `name`, including text after commas or parentheses.
- If amount or unit boundaries cannot be agreed on, set `labeling_status` to `needs_adjudication`; do not force a label.
- Each reviewed row should be independently checked against its source line. Candidate-generation hints are not labels.

## Reviewed evaluation sets

The reviewed corpus has two CSVs built from captured recipes and reviewed extraction expectations: `candidates.csv` contains 200 diverse ingredient lines, and `foreign_candidates.csv` contains 447 ingredient occurrences from recipes with non-English language detections. Preserve source file, URL, component index, ingredient index, source language, and exact line. The sets may overlap; report their scores separately and deduplicate by capture filename, component index, ingredient index, and source text if reporting a combined score. Expected fields are approved labels; draft fields remain for traceability.

Track exact field agreement for `qty`, `unit`, and `name`; exclude `status` from benchmark accuracy because its labels are inconsistent and are not part of ingredient extraction correctness. Normalize equivalent Unicode fraction glyphs in expected quantities to the agreed ASCII representation before comparison. Report results by category as well as overall; an overall score alone can hide failures on fractions or absent quantities.

## Production integration

- The deterministic parser runs over extracted full ingredient lines in both the extraction-v2 text enrichment path and image import path.
- The image extraction prompt requests full ingredient lines in `name` with null `qty` and `unit`; local parsing performs the split after extraction.
- Enrichment cannot replace parsed amount, unit, or ingredient name. The complete original ingredient line is retained as `shopping_list_value`.
- Unknown units remain visible with null structured amount/unit rather than being discarded.
- The unused legacy text extraction helper and its Gemini amount/unit splitting prompt were removed.
- Regression coverage exercises parser-backed text and image integration.

## Current benchmark result

The latest run covers 632 deduplicated reviewed rows and has exact agreement on `qty`, `unit`, and `name` for all 632 rows after normalizing expected fraction glyphs to the agreed ASCII representation. The diverse set scores 200/200 and the foreign-language set scores 447/447. The benchmark excludes `status` by design. See `services/api/tests/fixtures/unit_amount_parser_v2/benchmark-report.json` for row-level results.

The reviewed labels cover the agreed mappings and edge cases, including `bay leaves` → `leaf`, Polish `2 sztuki` → `piece`, French `verre` → `cup` in the reviewed rice recipe, `40 cl`, Spanish `cditas`, mixed `1 1/2` quantities, and compact range formatting. The malformed `Carne:` expected name and spacing artifacts after splitting are corrected. Status labels remain in the review CSVs for traceability but are excluded from parser accuracy comparisons.

## Out of scope

Unit conversion, shopping-list quantity rounding, recipe extraction from raw HTML, and re-extraction of saved recipes are separate work.
