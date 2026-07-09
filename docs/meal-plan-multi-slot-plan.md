# Plan: Multiple meals per day in the meal plan

Add the ability to assign more than one meal to a single day in the meal plan
(Breakfast / Lunch / Dinner slots), with a per-user/per-household setting that
controls which meal slots are active. Default remains effectively one meal per
day so existing plans look unchanged.

## Model / decisions

- **Named meals (Model C).** Fixed set: **Breakfast / Lunch / Dinner** (no
  snack). Users pick *which* are active via **checkboxes** — not a numeric
  count.
- **One recipe per `(day, meal type)`.** Tapping an occupied slot offers
  View / Change / Remove (same as today).
- **Disabling a meal hides but keeps its assignments** (reversible — data is
  never deleted on toggle-off; re-enabling brings it back).
- **Scope-aware setting.** The set of active meals is a property of the plan:
  the **personal** plan uses a per-user setting; a **household** plan uses a
  shared per-household setting. Any household member may change the shared set.
- **Minimum 1 meal enforced** — the last active meal cannot be unchecked.
- **Default = Dinner only** for new and existing users. Existing meal-plan
  entries backfill into the Dinner slot, so upgrade is visually a no-op.
- **Fixed display order** everywhere: chronological Breakfast -> Lunch -> Dinner,
  regardless of the order boxes were checked. No reordering.
- **1-meal case looks like today**: the single active slot renders unlabeled on
  screen and in exports; meal-type labels only appear when 2+ meals are active.

## Backend (`services/api`)

1. `models.py`: add `meal_type` string column (`'breakfast' | 'lunch' |
   'dinner'`) to `meal_plan_entries`. Replace the partial unique indexes
   `uq_meal_plan_personal` / `uq_meal_plan_household` (currently on
   `(user_id, date)` / `(household_id, date)`) with
   `(user_id, date, meal_type)` / `(household_id, date, meal_type)`.
2. Enabled-meals storage:
   - Personal: new `meals` JSON array column on `user_preferences`
     (default `['dinner']`).
   - Household: new `meals` JSON array column on `households`
     (default `['dinner']`).
3. `main.py` startup migration: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for
   the three new columns; **backfill** `meal_plan_entries.meal_type = 'dinner'`;
   then drop and recreate the unique indexes. Order matters — backfill before
   recreating the `(…, meal_type)` uniqueness so no existing row violates it.
4. Routes (`routes/meal_plan.py`):
   - `PUT /api/meal-plan/{date}/{meal_type}` and
     `DELETE /api/meal-plan/{date}/{meal_type}` — upsert/delete keyed by
     date **and** meal_type (update `_entry_filter` accordingly).
   - `GET /api/meal-plan?month=` returns `meal_type` on each entry.
   - New scope-aware **`GET`/`PUT /api/meal-plan/settings`** returning/writing
     `{ meals: [...] }`, reusing the existing `get_active_household_id`
     dependency to resolve personal vs. household scope in one place.
5. Exports (`routes/export.py`, PDF + XLSX): `_fetch_entries` returns per-slot
   titles instead of `dict[date, title]`. Render **multi-line labeled cells**
   (active slots only; empty active slots printed blank for hand-filling),
   honoring the active scope's enabled meals.

## Shared (`packages/shared`)

- `types.ts`: add `meal_type` to `MealPlanEntry`; add `MealType` and
  `MealPlanSettings { meals: MealType[] }`.
- `api/client.ts`: slot in path for set/delete; add `getMealPlanSettings` /
  `updateMealPlanSettings`.
- Hooks: `useMealPlan` keyed/set by `(date, meal_type)`; new
  `useMealPlanSettings` (query key e.g. `['mealPlanSettings']`, invalidated on
  active-household change and on mutation).

## Mobile (`apps/mobile`)

- `MealPlanScreen`:
  - `entriesByDate` keyed by date **and** meal_type.
  - `DayRow` renders a **vertical stack** of active slots (per-slot uppercase
    footnote label + recipe title/thumbnail, or a per-slot "add a dish" empty
    state). Single-meal case renders as today (unlabeled).
  - Computed `getItemLayout`: height = `activeCount × SLOT_HEIGHT + header`
    (active meals are the same for every day, so height is constant within a
    setting — keeps the long virtualized list smooth).
  - Per-slot tap: empty -> recipe picker -> assign to that slot; occupied ->
    View / Change / Remove.
- Header: sliders icon next to the printer -> `ActionSheetIOS` (or small sheet
  with `Switch` rows) listing Breakfast/Lunch/Dinner, a scope label
  ("Personal" / "Household"), and the min-1 guard.
- `AddToMealPlanSheet`: after picking a date, prompt for slot when >1 meal is
  active (skip the prompt when only 1 is active). "Assigned" dots reflect any
  slot holding the recipe. Occupied target slot -> no silent overwrite.

## Web (`apps/web`)

- `DayRow` (mobile-width list): vertical slot stack mirroring mobile.
- `DesktopCalendar`: each cell shows up to 3 vertical mini-slots (tiny label +
  title chip, or a faint "+" per empty active slot). Cells grow to fit; page
  scrolls (no cramming/truncation).
- Header: popover next to Print with 3 checkboxes + scope label + min-1 guard.
- `printMealPlan` / `buildWeekRows`: multi-line labeled day cells (active slots
  only, chronological order), matching the on-screen active meals.
- `AssignToMealPlanModal`: slot chooser when >1 meal is active.

## i18n

New keys in **all 5 locale files** (en, pl, de, fr, es):
- Meal-type names: breakfast / lunch / dinner.
- Slot empty state "add a dish" (reuse existing `mealPlan.addDish` where fits).
- Settings control: menu/sheet title, scope labels ("Personal" / "Household").
- Export label prefixes for meal types.

## Rollout / risk notes

- Migration is additive + backfill; the drop/recreate of unique indexes is the
  one delicate step — must run after the dinner backfill.
- The Dinner-only default keeps every existing surface visually identical on
  upgrade (screen and exports).
- Scope resolution lives in one server helper (`get_active_household_id`) so
  personal/household routing stays consistent with the existing meal-plan
  routes.
