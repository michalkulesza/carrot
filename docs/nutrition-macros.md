# Nutrition Macros (Protein / Fat / Carbs)

## Summary

Extend the existing Gemini-estimated `kcal_per_serving` field with three more per-serving macros: **protein**, **fat**, **carbs** (all whole grams). Recipe detail screens (mobile + web) get a unified 5-box stat grid — **Serves · kcal · Protein · Fat · Carbs** — replacing today's plain meta-row (mobile) and pill-row (web). Every other surface that shows kcal today gets the 3 new fields too, as plain text/columns (no boxes).

No backfill: existing recipes simply show `—` for the new fields until re-imported or edited.

---

## Data Model (backend)

### `models.py`
New nullable int columns/fields, named to match the existing `kcal_per_serving` convention (unit implied, not suffixed):

```python
class Recipe(Base):
    ...
    kcal_per_serving: Mapped[int | None]
    protein_per_serving: Mapped[int | None]  # grams
    fat_per_serving: Mapped[int | None]      # grams
    carbs_per_serving: Mapped[int | None]    # grams
```

Add the same 3 fields to `RecipeExtraction`, `RecipeSaveRequest`, `RecipeOut`, right next to `kcal_per_serving` in each.

No migration needed — schema is created via `Base.metadata.create_all` (`main.py:87`), so new nullable columns just appear on next boot.

### `packages/shared/src/types.ts`
Mirror the 3 new fields on `RecipeGroup`, `RecipeSaveRequest`, `RecipeOut`.

### `/stats` endpoint (`routes/recipes.py`)
Extend the existing `avg_kcal` / `with_kcal` computation (lines ~82–106) with `avg_protein`/`with_protein`, `avg_fat`/`with_fat`, `avg_carbs`/`with_carbs`. Mirror in `RecipeStats` type.

---

## Gemini Prompt (`services/api/src/api/services/gemini.py`)

Add 3 instructions to `_SYSTEM` alongside the existing kcal one (lines ~111–112), same tone/reliability bar:

```
protein_per_serving: extract from the text if stated. If not stated, estimate
based on the ingredients and typical preparation. Provide a realistic round
number in grams.

fat_per_serving: extract from the text if stated. If not stated, estimate
based on the ingredients and typical preparation. Provide a realistic round
number in grams.

carbs_per_serving: extract from the text if stated. If not stated, estimate
based on the ingredients and typical preparation. Provide a realistic round
number in grams.
```

Both `extract_recipe()` and `extract_recipe_from_image()` already return structured JSON via `response_schema=RecipeExtraction` — no separate call needed, the 3 new fields ride along in the same pass.

---

## Recipe Detail Screen — Box Grid (mobile + web)

Both apps replace their current display with a new **stat box grid** component:

- **Order**: Serves, kcal, Protein, Fat, Carbs — always 5 boxes.
- **Missing data**: fixed grid, always renders all 5; a null value shows `—` instead of a number.
- **Precision**: whole grams (no decimals), matching kcal's existing whole-number convention.
- **No icons** — each box is just a number + text label (e.g. `520` / `kcal`).
- **Editable**: all 5 fields get plain number inputs in edit mode, same pattern as today's servings/kcal inputs.

### Mobile (`RecipeDetailScreen.tsx`)
- Replace the `metaRow` (lines ~1160–1171) with a new `NutritionBoxGrid` component.
- Layout: horizontal `ScrollView` — boxes stay in one row, scroll sideways if they overflow screen width. No wrap.
- Style: bordered/background box per HIG card conventions — `PlatformColor('secondarySystemBackground')` background, `PlatformColor('label')` for the number (Headline/Callout weight), `PlatformColor('secondaryLabel')` for the unit/label text (Footnote size).

### Web (`RecipeDetailModal.tsx`)
- Replace the servings/kcal/source pill section (lines ~1503–1587) with the same box grid concept, styled as bordered boxes (not pills) to match mobile.
- Layout: CSS flex-wrap — one row on typical/wide viewports, wraps to 2 rows only if the window is narrow. No horizontal scroll on web.

### Disclaimer icon
- One shared `(i)` icon at the end of the box row (not per-box).
- **Mobile**: tap opens a custom inline popover bubble anchored near the icon (no native tooltip in RN) — dismisses on tap-away. Text: "Nutrition values are estimated from ingredients by AI and may be inaccurate."
- **Web**: click/hover opens an equivalent small popover with the same text.
- Scope: detail screen box grid only — not shown in compact views (list rows, table, cards, meal plan).
- Applies to kcal/protein/fat/carbs conceptually, not servings (servings keeps no disclaimer).

---

## Compact Views — Plain Text Extension Only

These stay as simple inline text, extended with the 3 new numbers (no box widgets, no disclaimer icon):

| Surface | File | Current pattern | New pattern |
|---|---|---|---|
| Mobile recipe list | `apps/mobile/src/screens/RecipesScreen.tsx` (~437–442) | `Serves: N · N kcal` | `Serves: N · N kcal · Ng P · Ng F · Ng C` |
| Web recipes table | `apps/web/src/components/RecipesTable.tsx` | sortable `kcal`/`servings` columns | +3 separate sortable columns: Protein, Fat, Carbs |
| Web recipe grid cards | `apps/web/src/pages/RecipesPage.tsx` (~173–175) | kcal/servings shown | + protein/fat/carbs |
| Web add/import form | `apps/web/src/components/AddRecipeModal.tsx` | kcal/servings inputs | +3 number inputs (protein/fat/carbs) |
| Web meal plan cards | `apps/web/src/pages/MealPlanPage.tsx` (~272–274, 824–826, 875–877) | per-meal kcal | + per-meal protein/fat/carbs (no daily totals — out of scope) |
| Web settings stats | `apps/web/src/pages/SettingsPage.tsx` (~930) | `Avg kcal` | + `Avg protein`, `Avg fat`, `Avg carbs` |

---

## Translations

New keys, following the existing `recipes.<nutrient>PerServing` convention (value pattern: `"<unit> / serving"`), added to all 5 locales (`en`, `pl`, `de`, `fr`, `es`):

- `recipes.proteinPerServing` → en: `"g protein / serving"`
- `recipes.fatPerServing` → en: `"g fat / serving"`
- `recipes.carbsPerServing` → en: `"g carbs / serving"`
- `settings.avgProtein`, `settings.avgFat`, `settings.avgCarbs` (mirroring `settings.avgKcal`)
- One new key for the disclaimer popover text, e.g. `recipes.nutritionEstimateDisclaimer`

---

## File Change List

| File | Change |
|---|---|
| `services/api/src/api/models.py` | Add `protein_per_serving`, `fat_per_serving`, `carbs_per_serving` to `Recipe`, `RecipeExtraction`, `RecipeSaveRequest`, `RecipeOut` |
| `services/api/src/api/services/gemini.py` | Add 3 prompt instructions to `_SYSTEM` |
| `services/api/src/api/routes/recipes.py` | Wire new fields in `save_recipe`/`update_recipe`; extend `/stats` with avg/with counts for each macro |
| `packages/shared/src/types.ts` | Mirror new fields on `RecipeGroup`, `RecipeSaveRequest`, `RecipeOut`, `RecipeStats` |
| `packages/shared/src/locales/{en,pl,de,fr,es}.json` | Add `recipes.proteinPerServing`, `fatPerServing`, `carbsPerServing`, `settings.avgProtein/avgFat/avgCarbs`, disclaimer text |
| `apps/mobile/src/screens/RecipeDetailScreen.tsx` | Replace `metaRow` with new `NutritionBoxGrid` (ScrollView, 5 boxes, edit-mode inputs, disclaimer popover) |
| `apps/mobile/src/screens/RecipesScreen.tsx` | Extend list-row text with protein/fat/carbs |
| `apps/web/src/components/RecipeDetailModal.tsx` | Replace pill section with box-grid component (flex-wrap), edit-mode inputs, disclaimer popover |
| `apps/web/src/components/RecipesTable.tsx` | Add 3 sortable columns |
| `apps/web/src/pages/RecipesPage.tsx` | Extend grid card text |
| `apps/web/src/components/AddRecipeModal.tsx` | Add 3 number inputs |
| `apps/web/src/pages/MealPlanPage.tsx` | Extend per-meal card text |
| `apps/web/src/pages/SettingsPage.tsx` | Add 3 avg-macro stats |
