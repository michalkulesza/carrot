# Meal Plan A4 + shared Selection Drawer

Status: completed

Design: https://claude.ai/artifact/QoRQGAvyX7tzj94kmzCZ1a (Meal Plan → "A4 · Day cards + next free day", "Drawer · pick recipes";
Mobile Screens → "Tags drawer", "Related recipes drawer"). Extracted HTML is not in the repo; every value needed is copied below.

## Decisions (from the user)

- **Several dishes per day.** Backend drops the one-entry-per-day rule. Entries are addressed by id.
- **Previous, current and next week shown by default** as one list of day cards with a small uppercase header per week ("Previous week" / "This week" / "Next week" / date range). "Show previous week" at the top and "Show next week" at the bottom each load one more week. No week-switcher bar (not in the design). On open, and whenever the Meal Plan tab icon is tapped, today's card is centred between the header and the tab bar (held until the user scrolls). iOS tab re-select scroll-to-top is disabled for this tab.
- **Keep drag-to-move** (long-press a dish, drop on another day card of the visible week).
- **Tap a dish → native action sheet**: View recipe (recipe dishes only) / Move to… / Remove.
- One reusable **Selection Drawer** powers the dish drawer, the tags drawer and the related-recipes drawer, and must be easy to reuse for future drawers.
- Header buttons follow `apps/mobile/AGENTS.md`: no button whose only job is to dismiss. The dish drawer shows **Add** only when something is selected; tags/related show no right button (they save on dismiss, as today).

## Conventions (same as the Recipe Edit feature)

- Palette/typography/radius tokens only, no hex in components. New tokens go in `apps/mobile/src/theme/colors.ts` with light + dark tones.
- Every sheet uses `BottomSheetModal` with the shared look in `components/ui/sheet.tsx`.
- Every string through `t()`, keys added to all 7 locales (en, pl, de, fr, es, it, pt).
- Repeated taps must be safe (idempotent backend, in-flight guards on the client).
- `const` arrow components, `memo` for list rows, `useCallback`/`useMemo` for anything passed to children, virtualised lists for recipe lists.
- Files under ~500 lines; split into folders (`index.tsx`, `helpers.ts`, `styles.ts`, `useXyz.ts`, one file per sub-component).
- No comments unless the why is non-obvious. Remove unused code you touch.

---

## Phase 1 — Backend + shared API (multi-dish days)

### Model / migration (`services/api/src/api/models.py`, `main.py` startup SQL)

- Remove `UniqueConstraint("household_id", "date")` from `MealPlanEntry`; add `Index("ix_meal_plan_household_date", "household_id", "date")`.
- Add `created_at: TIMESTAMPTZ NOT NULL DEFAULT now()` for stable ordering within a day.
- Startup SQL (same style as existing `ALTER ... IF NOT EXISTS` lines):
  - `ALTER TABLE meal_plan_entries DROP CONSTRAINT IF EXISTS uq_meal_plan_household`
  - `ALTER TABLE meal_plan_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `CREATE INDEX IF NOT EXISTS ix_meal_plan_household_date ON meal_plan_entries (household_id, date)`
- All list queries order by `date, created_at, id`.

### Endpoints (`routes/meal_plan.py`)

New:
- `POST /meal-plan/{date}/entries` body `{ items: [{ recipe_id } | { text }] }` (1–20 items) → `list[MealPlanEntryOut]` of the entries now on that date.
  Idempotent: skip a recipe already on that date, and a text equal (case-insensitive, trimmed) to one already on that date. Validates recipe access like PUT does.
- `DELETE /meal-plan/entries/{entry_id}` → 204, also 204 when it no longer exists (repeat taps). Scoped to the active household.
- `POST /meal-plan/entries/{entry_id}/move` body `{ to }` → moved `MealPlanEntryOut`. No swap. If the same recipe/text already exists on the target day, delete the source instead of duplicating, and return the existing target entry.

Legacy (keep working for installed app versions and until web is migrated):
- `PUT /meal-plan/{date}` replaces *all* entries on that date with the single given one.
- `DELETE /meal-plan/{date}` deletes all entries on that date.
- `POST /meal-plan/{date}/move` moves all entries from that date to `to` (merged, deduped as above).
- `GET /meal-plan/next` unchanged shape (first by date, created_at).

Every mutation publishes `meal_plan_changed` as today. Check `export.py` (PDF), `showcase.py` and `households.py` still behave with several entries per day (PDF lists each dish of a day).

Tests in `tests/test_meal_plan.py`: add several per day, idempotent add, delete by id (twice), move by id incl. dedupe, legacy PUT replaces all, legacy delete deletes all, ordering.

### Shared (`packages/shared`)

- `api/client.ts`: `addMealPlanEntries(date, items)`, `deleteMealPlanEntryById(id)`, `moveMealPlanEntryById(id, to)`. Keep the legacy functions only while something uses them; delete any that end up unused.
- Hooks:
  - `useMealPlanWeek(weekStartIso)` — loads the 1–2 month queries covering the week (`['mealPlan', 'YYYY-MM']` keys, so SSE invalidation keeps working) and returns `entriesByDate: Map<iso, MealPlanEntry[]>` (ordered).
  - `useMealPlanMutations()` — `addEntries`, `removeEntry`, `moveEntry` with optimistic cache updates on the month keys, rollback on error, `['mealPlan']` invalidation on settle, and the `['mealPlan','next',todayIso]` update `useMealPlan` does today. Replace `useMoveMealPlanEntry` with this.
- Update every consumer that assumed one entry per date: mobile `AddToMealPlanSheet` (adds instead of replacing; a date "already assigned" means this recipe is on it), Home `TonightCard` (unchanged shape), `usePlanMealForDate` (delete it once the meal plan screen no longer uses it).

---

## Phase 2 — Shared Selection Drawer (mobile)

New folder `apps/mobile/src/components/SelectionDrawer/`. It replaces `PickerSheetParts.tsx` (delete it once nothing imports it).

### Layout (design values)

- Sheet: shared sheet look; snap point `'83%'` (700/844), `enableDynamicSizing={false}`, `keyboardBehavior="interactive"`, `keyboardBlurBehavior="restore"`, pan-down + backdrop close.
- Top block: padding 10/20/12, gap 14, bottom hairline `palette.dividerCard`.
  - Header: 3 columns `1fr auto 1fr`.
    - Left: count label, 14pt (`typography.meta`), `textSecondary`.
    - Centre: title 17/700 `ink`; optional subtitle 13pt `textSecondary`, centred.
    - Right: optional action text button, 16/600 `actionText`, 44pt tall, right-aligned.
  - Search field: 44pt, radius 14 (`radius.control`), bg `palette.control`, padding 0 12, gap 8. Magnifier 18pt `textTertiary`, input 16pt `ink`, `BottomSheetTextInput`. Clear button 22pt circle `placeholder` bg with white 10pt ×, only while the query is non-empty.
  - Chip row (only when there are selected items): horizontal scroll bleeding to the sheet edges (margin 0 -20, padding 0 20), gap 6. Chip: 32pt tall, radius 14, bg `tint`, text 14/500 `actionText`, trailing 10pt ×; with a leading 24pt thumb (radius 8) padding is 0 9 0 4, without one 5 9 5 11.
- List: virtualised `BottomSheetSectionList`, padding 0 20 34, `keyboardShouldPersistTaps="handled"`.
  - Section header: 13/600, uppercase, letter-spacing 0.04em, `textSecondary`, padding 20 0 4.
  - Rows end with a hairline `dividerCard`.
  - Optional list-header slot above the sections (create/quick rows).
  - Empty state: centred 15pt `textSecondary`, padding 32 0.

### API (generic, not recipe-specific)

```tsx
<SelectionDrawer<T>
  visible onDismiss
  title subtitle? countLabel
  action?={{ label, onPress, disabled? }}
  search={{ value, onChange, placeholder }}
  chips?: ReactNode            // built with <SelectionChip/>
  listHeader?: ReactNode       // e.g. <CreateRow/>, <QuickAddRow/>
  sections: { key, title, data: T[] }[]
  renderItem, keyExtractor
  emptyLabel
/>
```

Exports from the folder:
- `SelectionDrawer`
- `SelectionChip` (`label`, `removeLabel`, `onRemove`, optional `leading`)
- `SelectionRow`, a memoised checkbox row:
  - `title`, optional `meta`, optional `thumbnailUrl` or `leading`, `selected`, `onToggle`, `disabled`
  - with a thumbnail: 52pt thumb (radius 12), min height 68, title 16pt
  - without: min height 50, title 17pt
  - title weight 600 when selected, 500 otherwise (400 for the no-thumb tag row is fine if 500 looks heavy)
  - meta 13pt `textSecondary`
  - trailing `CheckboxCircle` (26pt, border `ring` → filled `action`)
  - `accessibilityRole="checkbox"`
- `CreateRow`, the tinted "Create tag "x"" row: min height 52, margin-top 8, padding 0 14, radius 14, bg `tint`, a 26pt `action` circle with +, text 16pt `tintText` with the bold query.
- `QuickAddRow`, the "Add "x"" row: min height 68, 52pt `tint` square (radius 12) with a 22pt `actionText` plus, title 16/600, meta 13pt `textSecondary`, bottom hairline.
- `useDrawerSearch()`: query state, trimmed/lowercased value, reset on dismiss.

Keep present/dismiss handling (the `visible` → `present()`/`dismiss()` effect and the reset on dismiss) inside `SelectionDrawer` so consumers stay declarative.

### Recipe sections helper

`buildRecipeSections(recipes, query, t, { excludeId? })`, in `components/SelectionDrawer/recipeSections.ts`:
- **Favourites**: `is_favourite`.
- **Recently added**: the 5 newest by `created_at` that aren't favourites.
- **All recipes**: everything else, alphabetical.

Filtered by a title match on the query; empty sections are dropped. It's used by the related-recipes drawer and the dish drawer. Memoise it at the call site.

### Migrate existing drawers

- `TagPickerModal` → `SelectionDrawer`. The count label is "N selected". There's no right action. `CreateRow` appears when the query matches no tag. Sections are tag categories with selected tags first. Rows have no thumbnail. Behaviour stays the same.
- `RelatedRecipesPicker` → `SelectionDrawer` with `buildRecipeSections` and thumbnail rows. Chips have thumbs. Behaviour stays the same (saved on dismiss by `RelatedRecipesSection`).
- Also check `RecipePicker` and `AddRecipeDrawer/PersonalRecipePickerView`. `RecipePicker` is replaced by the dish drawer in Phase 3, so delete it then. Leave `PersonalRecipePickerView` unless it's a straightforward fit.
- Add the drawer rule to `apps/mobile/AGENTS.md`: list/select sheets use `SelectionDrawer`.

---

## Phase 3 — Meal Plan screen A4 (mobile)

Rewrite `apps/mobile/src/screens/MealPlanScreen/` around the visible week. Remove the 240-day list, month rows, Today button, `buildListItems`/`findDayIndexAtContentY`, `useCenterOnToday` and `DragPreviewCard`/`DropTargetHighlight` if they're replaced.

### Header

- Keep the native header (title "Meal Plan" + the existing print button, which exports the current week's month as a PDF). No extra bar below it.
- The list fills the whole screen under the transparent header and tab bar, padded by fixed insets from `useMealPlanInsets` (window insets at launch + nav/tab bar heights). The tab is mounted off-screen at launch, when `useHeaderHeight` and the screen safe area are not final yet, so measured values would make the list jump when first shown.
- The title includes `ScrollEdgeEffectAnchor` (an invisible native symbol): iOS 26 only draws the header's scroll-edge blur when the custom title view contains a native image.

### "This week" card

- Built, then removed after review: the screen starts straight with the days list.

### Days list (padding 0 20, gap 8)

- "Show previous week" (chevron up) above the list and "Show next week" (chevron down) below it: 40pt, 14/600 `textSecondary`.
- Each week starts with a 13/600 uppercase `textSecondary` header.
- Day card:
  - padding 12 14 12 12, radius 20, two columns (48pt date column, gap 12)
  - bg `card`; today: new token `todayCard` (`#FFF4EA` / dark ≈ `#2E2016`) with a 1.5pt `action` border
  - past days at opacity 0.55
  - date column: weekday 12/700 uppercase letter-spacing 0.06em (`textSecondary`, today `actionText`), day number 22/700 tabular (`ink`, today `actionText`)
  - dishes (gap 8): rows min 48pt with a 48pt thumbnail (radius 12)
    - quick meal: `tint` square with a 24pt `actionText` fork-knife symbol
    - title 16/600 clamped to 2 lines, meta 13pt `textSecondary` (recipe: "25 min · Asian" via the existing `formatRecipeMeta`; quick meal: "Quick meal")
  - empty day: "Add a dish" button (48pt, radius 14, bg `background`, 15/600 `actionText`, 16pt plus)
  - day with dishes: an "Add" text button below them (30pt, 14/600 `actionText`, 14pt plus, a11y "Add another dish to {day}")
- Tapping a dish opens a native action sheet (`ActionSheetIOS`/`Alert`): View recipe (recipe only), Move to… (opens a small native day picker: an action sheet listing the visible week's other days plus "Next week…" is fine), Remove (destructive), Cancel.
- Drag to move: long-press a dish row to lift it, hover a day card to highlight it, release to move (`moveEntry`). Use measured card layouts (`onLayout` relative to the scroll content) with Reanimated + Gesture Handler. Auto-scroll near the edges. Haptic on lift and on drop. Dropping on the same day does nothing.
- Loading: the existing `useScreenLoading` spinner. Errors: an alert on a failed mutation (optimistic rollback).
- `planToday` / `focusToday` params (from Home): jump to the current week; `planToday` opens the dish drawer for today.
- Fixed bottom padding for the floating tab bar (use the existing tab bar inset helper/safe area).

### Dish drawer (`MealPlanScreen/DishDrawer.tsx` + `useDishDrawer.ts`)

- `SelectionDrawer`:
  - title "Add to {Weekday}", subtitle the localised date ("26 Nov")
  - count label "N selected"
  - action "Add" when N > 0 (disabled while saving; the drawer closes when it succeeds)
- Search placeholder "Search recipes or type a quick meal".
- Selection holds recipes and quick meals in order (`{ kind: 'recipe', id } | { kind: 'quick', text }`).
- Chips: recipe chips show a 24pt thumb and the title shortened to its first two words; quick-meal chips show a white 24pt square with a 13pt fork-knife. Tapping a chip removes it.
- `QuickAddRow` "Add "{query}"" / "Quick meal · no recipe needed" appears when the query is non-empty, matches no recipe title exactly, and isn't already picked. Tapping it adds the quick meal and clears the query.
- Sections come from `buildRecipeSections`. Rows for recipes already on that day show meta "Already on this day". Picking them is allowed; the backend dedupes.
- Add → `addEntries(date, items)` with an in-flight guard, a success haptic, then dismiss.
- The same drawer is used from "Add a dish", "Add" and "Plan it".

---

## Phase 4 — Web compatibility (multi-dish days)

The web meal plan (`apps/web/src/pages/MealPlanPage/*`, `components/AssignToMealPlanModal.tsx`, `components/NextMealCard.tsx`, `api/client.ts`) must handle several entries per day:
- show every dish of a day
- assigning adds instead of replacing
- removing removes that entry by id
- drag/move uses move-by-id

No visual redesign. Then remove the legacy shared client functions if unused (keep the backend legacy endpoints for older mobile builds).

## Verification

- `cd services/api && uv run pytest tests/test_meal_plan.py`
- `cd apps/mobile && npx tsc --noEmit -p .`, plus the web typecheck
- No unused locals in changed files.
- Translation keys present in all 7 locales.

## Follow-ups done after review

- Selection drawers render with FlashList (rows recycled), search filtering is deferred with `useDeferredValue`, recipe meta is precomputed, and `CheckboxCircle` snaps instead of animating when a recycled row shows another item.
- Drawers keep their height when the keyboard opens (`keyboardBehavior="extend"`, `topInset` = safe-area top); the "N selected" header label was removed; the dish drawer shows cook time only (no kcal).
