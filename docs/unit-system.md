# Unit System

## Decisions

| Area | Decision |
|---|---|
| Scope | Metric only for now; imperial reserved for future |
| Unit field | Typed enum in both Python and TypeScript — no free-form strings |
| DB | Wipe accepted; no migration needed |
| User preference | Per-user `unit_system` setting (`"metric"` \| `"imperial"`), default `"metric"` |
| Settings UI | Dropdown in existing Settings page |
| Gemini | System prompt updated with allowed unit list + convert °F → °C; cups/tbsp kept as-is |
| Ingredient edit UI | Structured fields: qty input + unit dropdown + name + note (replaces free-form text line) |
| Display | Abbreviations in ingredient lists; full translated names in unit dropdown |
| Translations | All 5 locales (en, pl, de, fr, es); unit keys in `locales/*.json` |

## Unit Enum

| Category | Values |
|---|---|
| volume | `ml`, `l`, `tsp`, `tbsp`, `cup` |
| weight | `g`, `kg` |
| count | `piece`, `clove`, `slice`, `can`, `bunch`, `pinch`, `sprig`, `handful` |

Temperature (`°C`) appears only in step text — Gemini converts it from °F automatically.

## Implementation Steps

1. **Enum definitions**
   - Python: `UnitEnum(str, Enum)` in `models.py`
   - TypeScript: `UNITS` const array + `Unit` type in `api/client.ts`

2. **Backend model**
   - Change `Ingredient.unit: str | None` → `unit: UnitEnum | None`
   - Pydantic validation rejects values outside the enum

3. **User settings**
   - Add `unit_system` column to `users` table
   - Expose via `GET /api/users/me` and `PATCH /api/users/me`
   - Settings page: dropdown row (`Metric` / `Imperial`)

4. **Gemini system prompt**
   - Inject allowed unit list from the user's `unit_system`
   - Instruct Gemini: use only listed units; convert °F → °C; keep cups/tbsp

5. **Ingredient edit UI**
   - Replace `EditLine` free-text ingredient rows with structured fields
   - Apply to both `AddRecipeModal.tsx` (import flow) and `RecipeDetailModal.tsx` (edit existing)

6. **Translations**
   - Add `units` section to all 5 locale files with abbreviated labels and full display names
