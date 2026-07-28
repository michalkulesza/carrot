# Cook mode ingredient rail — approximate step→ingredient positioning

Status: ready to implement

Re-introduces a narrower version of the step/ingredient matching removed in `8778764`
("Remove per-step ingredient references"). Read that commit before starting: the prompt
wording for inflected-language matching is worth reviving, but **the data shape and the UI
are deliberately different this time** and must not be copied back wholesale.

| Part | Scope | What it delivers |
|---|---|---|
| **A** | `services/api/src/api/` | `step_ingredient_line` — one int per step, produced by the existing enrichment call |
| **B** | `services/api/scripts/` | One-off backfill for the 112 existing recipes |
| **C** | `apps/mobile/src/screens/RecipeDetailScreen/` | Auto-centering ingredient rail; removes the ingredients sheet |
| **D** | `apps/web/src/components/RecipeDetailModal/` | Same rail, same behaviour; removes the ingredients modal |

A must land before B. C and D are independent of each other but both depend on A.

## Design premise — read this first

The previous attempt pinpointed **every** ingredient in a step and rendered them as inline pills
and per-step lists. It was removed because the matching **was not reliably correct**, and a wrong
pill is a confident wrong claim.

This version deliberately trades precision for survivability:

> Point at an **approximate position** in the original ingredient list and let the user's eye
> validate against the neighbours.

Every decision below follows from that premise. Specifically: **one** index per step rather than a
set, a **5-row window** rather than a highlighted line, and **no row marker at all** — position
alone carries the signal. A wrong match must look slightly off-centre, never like the app asserting
something false.

## Grounding data (production, 2026-07-28)

Queried directly against `carrot-db-1`. These numbers justify several choices:

| Measure | Value | Consequence |
|---|---|---|
| Recipes | 112 | Backfill is cheap; a one-off script is viable |
| Components | 161 | ~161 tiny model calls for backfill |
| Single-component recipes | 86 (77%) | Multi-component handling matters but is the minority path |
| Max components in one recipe | 6 | Flat rail list can reach ~60 rows |
| Ingredients per component | avg 10, max 28 | — |
| Components with >5 ingredients | 118 (73%) | **The rail scrolls for most recipes — centring genuinely earns its keep** |
| Ingredient strings ≤30 chars | 1066 / 1552 (69%) | ~31% will be tail-truncated on one line |
| Longest ingredient string | 134 chars | Truncation is unavoidable at one line |

## Part A — `step_ingredient_line` from the enrichment call

### Why the existing call, not a new one

`_ENRICHMENT_SYSTEM` already returns six parallel per-component arrays (`metric_ingredients`,
`imperial_ingredients`, `metric_steps`, `imperial_steps`, `shopping_list_values`,
`shopping_list_categories`) plus macros and tags. One more int-per-step array is marginal, the
model already holds every step and ingredient in context, and `_repair_enrichment_alignment`
(`gemini.py:399`) already knows how to salvage a misaligned parallel field without a second call.
No extra round-trip.

### Model changes

`services/api/src/api/models.py`:

```python
class EnrichmentComponent(UnitVariantComponent):
    ...
    step_ingredient_line: list[int | None] = []

class RecipeComponent(BaseModel):
    ...
    step_ingredient_line: list[int | None] = []

class SaveComponent(BaseModel):
    ...
    step_ingredient_line: list[int | None] | None = None
```

`RecipeOut.components` is `list[Any]` (`models.py:466`) — an untyped passthrough. **No API-layer
change is needed there**; the field reaches both clients automatically once it is in the saved
JSON. `Recipe.components` is a `JSON` column (`models.py:225`), so **there is no migration**.

### Prompt

Append to `_ENRICHMENT_SYSTEM` (`gemini.py:182-221`), after the `tags` paragraph:

```
step_ingredient_line: exactly one entry per step in this component, in order.
For each step, identify every ingredient that step references — by full name,
inflected or declined form (e.g. "kurczakiem" for "kurczak", "Zwiebeln" for
"Zwiebel"), key noun ("chicken" for "chicken thighs, skin on"), plural, or
abbreviation — then return the 0-based index of the MIDDLE one of those
ingredients in this component's ingredients list. With an even number of
matches, return the lower middle. Return null when the step references no
ingredient at all. Match across all languages; for inflected languages
(Polish, Russian, Czech, German) recognise every grammatical case and number
variant of the ingredient name.

Example — ingredients ["flour", "bread", "chicken", "oil", "potatoes"] and the
step "Fry the chicken in the oil with potatoes" references indexes 2, 3 and 4,
so the middle one is 3.
```

The worked example is the user's own and pins the indexing convention: **0-based**, so index 3 is
`oil`. Keep it in the prompt — it is the cheapest guard against the model returning 1-based indexes.

### Repair, not retry

The field must **never** trigger enrichment regeneration. A bad value costs a rescroll; a retry
re-bills macros, unit conversions and shopping categories. In `_repair_enrichment_alignment`, per
component:

- length ≠ `len(source_component.steps)` → pad with `None` / truncate to match
- value `< 0` or `>= len(source_component.ingredients)` → `None`
- append a line to `repairs` in both cases, matching the existing logging style

Do **not** add a check for it in `_enrich_recipe`'s validation block (`gemini.py:503-513`), and do
**not** raise for it in `assemble_recipe` — the deleted code raised `ValueError` on out-of-range
step refs (`gemini.py` pre-`8778764`); that behaviour is explicitly not wanted here.

Extract the matching instruction into a reusable constant so Part B can drive the same prompt
standalone against `(steps, ingredient_names)` without running the full enrichment.

### Invalidation on edit

`useEditDraft.ts:234-241` filters empty ingredients and steps on save, and the editor allows
insert/delete at any position — so stored indexes go stale. On save, per component:

```
if len(ingredients) != stored_ingredient_count or len(steps) != stored_step_count:
    step_ingredient_line = None
```

Degrading to "no match" is correct: it falls into the fallback path in Part C and the rail simply
stops centring. **Wrong-but-confident must never happen; silently-not-working is acceptable** and
is repairable by re-running the Part B script.

## Part B — backfill script

`services/api/scripts/backfill_step_lines.py`, modelled on `reimport_recipes.py` but **far**
narrower. For each recipe, for each component: send only `steps` + ingredient names to the cheap
model using the shared matching prompt, write `step_ingredient_line` into the component dict, flag
the JSON column as modified, commit.

It must **not** touch titles, quantities, macros, unit variants, shopping categories or tags —
that is the whole reason a full `reimport_recipes.py` run was rejected. ~161 calls.

Make it idempotent and re-runnable (`--recipe-id` for spot fixes, skip components already
populated unless `--force`).

## Part C — mobile rail

`apps/mobile/src/screens/RecipeDetailScreen/CookMode.tsx` is 638 lines and will grow. Extract the
rail into `RecipeDetailScreen/IngredientRail.tsx`, and put the flat-list construction and target
resolution in `RecipeDetailScreen/helpers.ts` as pure functions (they are the part worth unit
testing).

### What is removed

The rail **replaces** the existing ingredients sheet. Delete:

- the `list-outline` toolbar button's current `onOpenIngredients` → `ingredientsSheetRef.present()` behaviour
- the `BottomSheetModal` and `BottomSheetScrollView` ingredient sheet (`CookMode.tsx:480-525`)
- `ingredientsSheetRef`, the `checked` state, `CheckboxIcon` usage, and the
  `ingredientsOverlay` / `ingredientScroll` / `ingredientRow` / `ingredientText` styles
- the equivalent block in `apps/web` (`CookMode.tsx:250-300`, `ingredientsOpen`, `checked`)

**This drops the ingredient checkboxes.** That was accepted knowingly — flagging it here because it
is a real capability loss and the one decision most likely to be regretted. Nothing else in cook
mode reads `checked`.

The toolbar button **stays**, repurposed to show/hide the rail.

### List construction

Flat across **all** components, with a component-name header row before each component's
ingredients (only when the recipe has more than one component — 86 of 112 recipes have exactly one
and must not grow a pointless header).

Header rows use the **same fixed height** as ingredient rows. This keeps `getItemLayout` uniform,
which is what makes `scrollToIndex` exact.

```
flatIndex(componentIndex, ingredientIndex) =
    (rows before this component) + (1 if headers shown else 0) + ingredientIndex
```

### Row text

Rail rows must respect unit system and serving scale — the rail's whole job is "how much of this",
so unscaled amounts defeat it.

`selectedServings` and `unitSystem` already exist in `RecipeDetailScreen/index.tsx` and are passed
to `ReadView` (`:352-354`) but **not** to `CookMode` (`:374`). Pass them through, then build row
text with the same path `ReadView` uses:

```ts
displayIngredient(scaleIngredientQuantity(variantIngredient, servingScale))
```

Step text stays raw (`component.steps`). Cook mode is therefore briefly inconsistent with itself —
scaled ingredients, unscaled steps. That is a **pre-existing** gap (cook mode never used
`metric_steps`/`imperial_steps`) and is explicitly out of scope.

### Target resolution

Per flattened cook step, resolve the row to centre:

```
target(i):
  line = step_ingredient_line[i]
  if line != null      -> flatIndex(componentIndex, line)
  elif i > 0           -> target(i - 1)      // carry forward
  else                 -> 0                  // first step, no match: top of list
```

Carry-forward **crosses component boundaries** — one rule, no special case. Consequence: the first
step of a new component with no match leaves the rail on the previous component's ingredients until
some step matches. Accepted deliberately in favour of a single rule.

Components with **0 ingredients** exist in production. Guard: if the flat list is empty, render no
rail at all.

### Behaviour

- **5 visible rows**, fixed row height, single line, `numberOfLines={1}` with tail ellipsis
- `getItemLayout: (_, index) => ({ length: ROW_H, offset: ROW_H * index, index })`
- Centre with `scrollToIndex({ index: target, viewPosition: 0.5, animated: true })`
- **Always re-centre on step change** — every advance discards any manual scroll. The invariant is
  that the rail's position always means "current step". (An earlier decision to re-centre only when
  the target changed was reversed; do not reinstate it.)
- Freely user-scrollable — it is now the only way to see the full list. Never fight a scroll in
  progress; re-centre on step change only.
- **Edge fade only, no row marker.** No pill, no bold, no accent colour. Rows fade toward the top
  and bottom of the window.

### Edge fade implementation

Mobile has **no** `expo-linear-gradient` and no masked-view (`apps/mobile/package.json`). Add
`expo-linear-gradient` via `npx expo install expo-linear-gradient` and overlay two short gradients
(top and bottom) running from the cook-mode background to transparent. `bg` is a solid hex from
`cookColor()` (`#f7f5f0` / `#20211f`), so this composites exactly with no alpha guesswork.

Do not compute per-row opacity from distance-to-centre — it desynchronises during manual scrolling.

### Toggle

Follow the existing `FONT_SCALE_STORAGE_KEY` pattern (`CookMode.tsx:228`) exactly:

```ts
const RAIL_VISIBLE_STORAGE_KEY = 'cook-mode-ingredient-rail'
```

Default **on**, read on mount, written on toggle, **global** — not per recipe. Add
`Haptics.impactAsync(ImpactFeedbackStyle.Light)` on toggle, matching `handleFontSizeChange`.

### Vertical budget

The instruction text auto-fits from 39pt down to a 22pt floor against
`mainHeight - reservedHeight`, currently `62 + (durations.length > 0 ? 72 : 0)`
(`CookMode.tsx:384`). Add the rail's height to `reservedHeight` **only when the rail is visible**,
or the step text will overflow. This is the fix that makes the toggle genuinely useful — hiding the
rail returns the full 39pt to the step text.

## Part D — web rail

Same behaviour, same list construction, same carry-forward rule, same toggle semantics
(`localStorage` rather than `AsyncStorage`). The web edge fade is a CSS
`mask-image: linear-gradient(...)` — no dependency needed. Web cook mode already mirrors mobile's
structure (`apps/web/src/components/RecipeDetailModal/CookMode.tsx:99-103` builds the identical
flattened `allIngredients`).

Web must also drop its ingredients modal and checkboxes so the two cook modes do not disagree about
whether checkboxes exist.

## Translations

Any new user-visible string (rail toggle `aria-label` / `accessibilityLabel`, component headers if
they gain any wrapper copy) goes into **all five** locales: `en`, `pl`, `de`, `fr`, `es` in
`packages/shared/src/locales/`. `8778764` removed two keys per locale when the old feature went;
do not reuse those key names for different meanings.

## Accepted risks

1. **Checkboxes are gone.** No "already added this" state anywhere in cook mode. Most likely
   decision to be revisited.
2. **~31% of ingredients truncate** on one line. Truncation eats the tail, which is usually prep
   notes ("finely chopped", "plus more for drizzling"); quantity and name lead and survive.
3. **Carry-forward across component boundaries** can show the wrong component's ingredients on an
   unmatched first step.
4. **Manual recipes never get matching.** Recipes built in `NewRecipeScreen` skip enrichment
   entirely, so the rail shows from the top and never centres. Not addressed here; the Part B
   script can be pointed at them if it ever matters.
5. **Matching is known-imperfect by design.** The 5-row window and absence of a row marker are the
   mitigation, not a fallback.
