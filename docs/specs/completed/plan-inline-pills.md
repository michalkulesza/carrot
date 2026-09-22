# Inline Ingredient & Timer Pills in Recipe Steps

## Summary

Two inline pill types appear inside step text in the recipe view:
- **Ingredient pills** — clickable, blue-tinted, show a popover with quantity
- **Timer pills** — placed right after the time expression, existing start/pause/resume behavior

---

## Ingredient Pills

### Matching (backend)
- **When**: at recipe create (`POST /recipes`) and update (`PUT /recipes/{id}`) time
- **How**: new `match_step_ingredients(components)` function in `gemini.py`
- **Gemini output**: list of `{ component_index, step_index, ingredient_index, mention }` records
  - `mention` = exact substring found in the step text (e.g. `"onions"`)
- **Scope**: same component only — no cross-component matching
- **Storage**: new field `step_ingredient_refs` on `SaveComponent`
  - Type: `list[list[StepIngredientRef]] | None` — outer list = per-step, inner = matched refs
  - `StepIngredientRef`: `{ ingredient_index: int, mention: str }`
  - Stored as JSON alongside `ingredient_flags` in the `components` column

### Models (`models.py`)
```python
class StepIngredientRef(BaseModel):
    ingredient_index: int
    mention: str

class SaveComponent(BaseModel):
    ...
    ingredient_flags: list[AllergenFlag] | None = None
    step_ingredient_refs: list[list[StepIngredientRef]] | None = None  # NEW
```

### Gemini service (`gemini.py`)
New function `match_step_ingredients`:
- System prompt: identify which ingredient each step mentions by name/plural/synonym
- Returns structured JSON: list of `{ step_index, ingredient_index, mention }`
- Model: `gemini-3.1-flash-lite` (lightweight task)
- Result mapped into `list[list[StepIngredientRef]]` (indexed by step)

### Route (`routes/recipes.py`)
- After building components in `save_recipe` and `update_recipe`, call `match_step_ingredients` for each component
- Inject refs into component data before `model_dump()`
- Fire-and-forget is acceptable if latency is a concern, but blocking is simpler

---

## Timer Pills (inline placement)

### New utility (`TimerContext.tsx`)
Add `parseDurationMatch(text)` alongside existing `parseDurationSeconds`:
```ts
interface DurationMatch {
  seconds: number
  start: number   // index in string where match begins
  end: number     // index where match ends (exclusive)
}
export function parseDurationMatch(text: string): DurationMatch | null
```
Reuses the same regexes as `parseDurationSeconds` but captures match index via `String.prototype.search` or regex `exec`.

### Step rendering (`RecipeDetailModal.tsx`)
Replace plain `<span className="flex-1">{step}</span>` with a `StepText` component that:
1. Calls `parseDurationMatch(step)` → if match found, splits text into before/after and renders `StepTimerChip` inline between them
2. Calls ingredient refs for this step → for each `{ mention }`, finds all occurrences with `indexOf` (repeated), splits text around each, renders `IngredientPill` inline
3. Both transformations compose: text is split into a sequence of string segments and React elements

Processing order: timer first, then ingredients (or process all in one pass sorted by position).

---

## Ingredient Pill Component (frontend)

```tsx
function IngredientPill({ ingredientText }: { ingredientText: string }) {
  // ingredientText = displayIngredient(ingredients[ref.ingredient_index], t)
  // click opens Popover showing the full ingredient string
}
```

**Style**: `bg-blue-50 text-blue-700 rounded-md px-2 py-0.5 text-xs font-medium`

**Popover**: small floating panel (e.g. Headless UI Popover or simple absolute div) showing the ingredient quantity, dismisses on click-away.

**All occurrences**: every mention of the matched substring in the step gets a pill (not just the first).

---

## File Change List

| File | Change |
|------|--------|
| `services/api/src/api/models.py` | Add `StepIngredientRef`, add `step_ingredient_refs` to `SaveComponent` |
| `services/api/src/api/services/gemini.py` | Add `match_step_ingredients()` |
| `services/api/src/api/routes/recipes.py` | Call matching in `save_recipe` and `update_recipe` |
| `apps/web/src/context/TimerContext.tsx` | Add `parseDurationMatch()`, export it |
| `apps/web/src/components/RecipeDetailModal.tsx` | Add `IngredientPill`, `StepText` component; update `ViewComponent` step rendering |
| `apps/web/src/locales/*.json` | Add keys for ingredient pill tooltip if needed |
