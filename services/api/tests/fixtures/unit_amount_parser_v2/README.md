# Unit and amount parser v2 review candidates

`candidates.csv` is a deterministic sample of distinct ingredient strings from
the reviewed extraction expectations. Rebuild it from the repository root with:

```powershell
python services/api/tests/build_unit_amount_parser_v2_candidates.py
```

The default output contains 200 distinct ingredient strings. Pass `--limit` to
request a different sample size.

The `category_hints` and `sampling_stratum` columns are regex-based sampling
hints only. They are not parser outputs, verified classifications, or gold
labels. Reviewers should fill `expected_qty`, `expected_unit`, and
`expected_name` from the exact `ingredient_text`, and set `expected_parse_status`
to `parsed`, `partial`, or `uncertain` according to the parser contract.
Convert decimal commas to decimal points (for example `1,2` to `1.2`). Keep metric
amounts (`g`, `kg`, `ml`, `cl`, `l`) and US weight amounts (`oz`, `lb`) as decimals.
For US volume amounts (`cup`, `tbsp`, `tsp`), normalize to a common fraction only
when the value matches exactly (for example `1,5` to `1 1/2`); do not round. Normalize range words or
dashes to a compact hyphen (for example `1 to 2` to `1-2`). Map clear unit
spellings to the app's singular canonical English unit identifier (for example
`sheets` to `sheet`, Polish `litra` to `l`, `liście` to `leaf`, `teaspoons` to
`tsp`, `tablespoons` to `tbsp`, `ounces` to `oz`, or `pounds` to `lb`); the
original line retains the source wording. Unit labels are translated for
display in the app and pluralized for amount and locale. Add
ambiguity or decision context in `reviewer_note`. Set
`labeling_status` to `reviewed` only after
checking the labels, or `needs_adjudication` when amount or unit boundaries
cannot be agreed on. These are separate statuses: `expected_parse_status`
labels the expected parse result; `labeling_status` tracks the human review
state. Blank expected fields on unreviewed rows mean not yet labeled, not null parser output. Rebuilding preserves review fields for matching source rows.

Preserve the source text when a field is unclear; explain that in the note
rather than guessing. `component_index` and `ingredient_index` are zero-based
positions in the capture's reviewed expectation. `source_url` is read from the
corresponding captured-payload envelope when available. Duplicate ingredient
strings are deduplicated case-insensitively after whitespace normalization.


## Assistant-proposed draft labels

The `draft_qty`, `draft_unit`, `draft_name`, `draft_parse_status`, and `draft_note` columns contain assistant-proposed interpretations for reviewer convenience. They are not verified labels and must be checked against each exact `ingredient_text`. Keep the `expected_*` benchmark fields blank until a human accepts or corrects a proposal; do not change `labeling_status` based on the draft. Blank draft quantity or unit means no confident explicit field was identified. Rows marked `uncertain` need particular review.

## Foreign-language review set

`foreign_candidates.csv` contains every ingredient occurrence from captured
recipes whose `detected_languages` includes a language other than English. It
preserves the complete detection value in `source_language` (including mixed or
additional detections). Rebuild it from the repository root with:

```powershell
python services/api/tests/build_unit_amount_parser_v2_foreign_candidates.py
```

The builder maps clear unit aliases from the five supported languages (English,
Polish, German, French, and Spanish) to singular canonical English identifiers.
Examples include `cda(s)` / `cucharada(s)` → `tbsp`, `cdta(s)` /
`cucharadita(s)` → `tsp`, `łyżka` / `EL` / `cuillère à soupe` → `tbsp`,
`łyżeczka` / `TL` / `cuillère à café` → `tsp`, and language-specific spellings of schema-supported units such as cups, metric
measures, cloves, leaves, pinches, cans, slices, sprigs, sheets, and bunches.
Unsupported unit types remain partial for review instead of receiving an invalid ID. Ingredient names
remain in their source language. New rows are unreviewed; rebuilding preserves
reviewed expected labels, reviewer notes, and draft edits for matching source rows.

The draft builder also recognizes common localized range connectors (`to`,
`a`/`à`, `bis`, `do`) and mixed amounts joined by `and`, `i`, `und`, `et`, or
`y`. Common leading approximation markers such as `about`, `circa`, Polish
`około`, German `ca.`, French `environ`, and Spanish `aproximadamente` are
omitted from the quantity and recorded in the draft note. When a clear number
and unit occur inside a line instead of at its beginning (for example,
`brodo 500 ml`), the draft can recover that pair while retaining the
source-language ingredient name. These remain suggestions and should be
reviewed, especially where a line contains more than one ingredient or amount.
