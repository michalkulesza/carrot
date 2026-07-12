# Grouped tag filters (Protein / Carb / Cuisine / Time) on the Recipes list

## Context
The Recipes list filter row currently shows a "★ Favourites" chip (icon + text label) plus a
horizontally-scrollable strip of every tag as flat pills, single-select. The user wants:
- The favourites chip to be icon-only (no "Favourites" text label).
- Four new dropdown-style pills — **Protein, Carb, Cuisine, Time** — sitting in the same row as
  favourites, together spanning the full row width.
- A recipe can carry multiple tags within one category (e.g. Chicken *and* Beef), so each
  dropdown is multi-select.
- All the *other* tags (not in one of the four categories) keep behaving as today: a second,
  horizontally-scrollable row underneath.
- On desktop web, row 1 (fav + dropdowns) and row 2 (leftover tags) can sit in a single row if
  there's room; on mobile (native app, and narrow web) they stack as two rows.
- This applies to the **Recipes list filter bar only** (mobile `RecipesScreen`, web
  `RecipesPage/FilterBar`) — not the Recipe Detail screen's own tag display, which is unchanged.
- The recipe edit/create tag picker (mobile `TagPickerModal`, web `TagRow`'s picker) gets a
  lighter-touch update: group the existing searchable list into category sections
  (Protein / Carb / Cuisine / Time / Other) instead of one flat list. Selection mechanics
  (tap-to-toggle) stay the same.

Tags currently have no notion of category — just `is_default` + optional `user_id`/`household_id`
ownership. This requires a backend schema change (`category` column on `Tag`), grouped default-tag
seed data (Chicken, Beef, Fish… Potatoes, Rice… Italian, Asian… Quick, Medium, Long…), and plumbing
`category` through the shared types, both apps' filter UIs, and both apps' tag pickers.

## Backend (`services/api`)

**`src/api/models.py`** — add `category: Mapped[str | None]` (nullable `VARCHAR(20)`) to the `Tag`
model, and `category: str | None = None` to `TagOut`. `TagCreate`/user-created tags are left
uncategorized (they land in the "Other" bucket) — categories are only assigned to curated default
tags.

**`src/api/main.py`**:
- Add an idempotent migration line next to the existing ones in `lifespan()` (~line 106):
  `ALTER TABLE tags ADD COLUMN IF NOT EXISTS category VARCHAR(20)`.
- Turn `_DEFAULT_TAGS` from `list[str]` into `list[tuple[str, str | None]]`, keeping every existing
  entry (category `None` unless noted) and adding the new category-bearing tags:
  - `protein`: Chicken, Beef, Pork, Fish, Seafood, Turkey, Tofu, Eggs
  - `carb`: Potatoes, Rice, Pasta, Bread, Noodles
  - `cuisine`: Italian *(existing, recategorize)*, Asian *(existing, recategorize)*, Mexican,
    Indian, Mediterranean, French, American
  - `time`: Quick *(existing "Method" tag, recategorize)*, Medium, Long
  - everything else (Vegetarian, Vegan, Gluten-Free, Dairy-Free, Keto, Low-Carb, Breakfast, Lunch,
    Dinner, Snack, Dessert, Drink, Grilled, Baked, One-Pot, High-Protein, Comfort Food) stays
    `None`.
- Update `_seed_default_tags()` to both insert missing default tags **and** backfill `category` on
  already-seeded rows whose category doesn't match yet (so existing deployments get recategorized,
  not just new tag rows):
  ```python
  async def _seed_default_tags() -> None:
      async with async_session_maker() as session:
          existing = await session.execute(select(Tag).where(Tag.is_default.is_(True)))
          existing_by_name = {t.name: t for t in existing.scalars().all()}
          for name, category in _DEFAULT_TAGS:
              tag = existing_by_name.get(name)
              if tag is None:
                  session.add(Tag(name=name, is_default=True, user_id=None, category=category))
              elif tag.category != category:
                  tag.category = category
          await session.commit()
  ```

No changes needed to `routes/tags.py` (list/create/delete) — `TagOut.category` flows through
automatically via `model_validate`.

## Shared package (`packages/shared`)

- **`src/types.ts`**: add `export type TagCategory = 'protein' | 'carb' | 'cuisine' | 'time'` and
  `category: TagCategory | null` on the `Tag` interface.
- **New `src/utils/tagFilters.ts`**:
  - `TAG_CATEGORIES: TagCategory[] = ['protein', 'carb', 'cuisine', 'time']`
  - `groupTagsByCategory(tags: Tag[]): Record<TagCategory, Tag[]> & { other: Tag[] }` — buckets by
    `category`, uncategorized tags go to `other`.
  - `matchesTagFilters(recipeTags: Tag[], allTags: Tag[], selectedTagIds: Set<string>): boolean` —
    groups `selectedTagIds` by the category of each id (looked up via `allTags`, `other` for
    uncategorized/leftover tags), then requires the recipe to contain **at least one** selected id
    from **every** group that has a selection (AND across groups, OR within a group). This is the
    single filtering rule used by both the four dropdowns and the leftover tag strip, and reduces
    correctly to the old single-select behavior when 0 or 1 tags are selected.
- **`src/locales/{en,pl,de,fr,es}.json`**:
  - Add `tags.category.protein/carb/cuisine/time` and `tags.category.other` (section headers,
    e.g. "Protein", "Carb", "Cuisine", "Time", "Other").
  - Add the new default tag names to `defaultTags.*` in all 5 locale files (Chicken, Beef, Pork,
    Fish, Seafood, Turkey, Tofu, Eggs, Potatoes, Rice, Pasta, Bread, Noodles, Mexican, Indian,
    Mediterranean, French, American, Medium, Long — `Quick`/`Italian`/`Asian` already exist).

`useTags.ts` is unchanged — it already returns the flat `Tag[]` with whatever fields `TagOut` has.

## Mobile (`apps/mobile`)

### Filter bar — `src/screens/RecipesScreen/index.tsx` + `styles.ts`
- Replace `selectedTagId: string | null` state with `selectedTagIds: Set<string>`.
- `filtered` memo: replace the `matchesTag` line with
  `matchesTagFilters(r.tags, tags, selectedTagIds)` (from `@carrot/shared/utils/tagFilters`).
- `handleTagPress` becomes a generic `toggleTagId(tagId)` that adds/removes from the set (reused by
  both the leftover-tag chips and the new dropdown modals).
- `favChip`: drop the `{'★ '}{t('recipes.filterFavourites')}` text — render just the star glyph
  (keep `accessibilityLabel={t('recipes.filterFavourites')}` for a11y). Give it a fixed square size
  instead of the pill-with-text sizing.
- Split the tag data via `groupTagsByCategory(tags)`: the 4 category buckets feed the new dropdowns,
  `other` feeds the existing leftover `FlatList` (`renderTag`, unchanged apart from reading
  selection from `selectedTagIds.has(item.id)` and calling `toggleTagId`).
- New component **`src/screens/RecipesScreen/CategoryFilterChip.tsx`**: a `flex: 1` pill (caret ▾
  + label) for one category. Label = translated category name when nothing selected in that
  category, or the selected tag name(s) (first name, `+N` suffix if more than one) when active.
  Tapping opens a `Modal` bottom sheet (same visual language as `TagPickerModal` in
  `RecipeFieldEditors.tsx`, but simpler: no search box, no create-tag — just the category's tags
  with a checkmark, tap toggles via the passed-in `onToggle`).
- `styles.tagBar` becomes `flexDirection: 'column'`; add `tagBarRow1` (`flexDirection: 'row',
  alignItems: 'center', gap: 8, paddingHorizontal: 16`) wrapping `favChip` (fixed width) + the 4
  `CategoryFilterChip`s (each `flex: 1`), and keep the existing divider + `FlatList` as
  `tagBarRow2` beneath it. `tagBarHeightSV`'s existing `onLayout` measurement keeps working
  unchanged since it just measures the whole `tagBar` view's height.
- Empty-state text / "clear filter" button: swap `selectedTagId` checks for
  `selectedTagIds.size > 0`, and clearing resets to `new Set()`.

### Edit/create tag picker — `src/components/RecipeFieldEditors.tsx` (`TagPickerModal`)
- Replace the single flat `filtered.map(...)` list with `groupTagsByCategory(filtered)` and render
  one section per non-empty category (`Protein`/`Carb`/`Cuisine`/`Time`/`Other`) using a small
  section-header `Text` (reuse `styles.tagModalTitle`-style typography, footnote/uppercase per the
  house type scale) above each group's existing row list. Tap-to-toggle behavior (`handleTagRowPress`,
  checkmark, create-tag row) is unchanged.

## Web (`apps/web`)

### Filter bar — `src/pages/RecipesPage/FilterBar.tsx`, `index.tsx`, `helpers.ts`, `RecipeCard.tsx`, `NoMatchingRecipesEmptyState.tsx`
- `RecipesPage/index.tsx`: replace `filterTag: Tag | null` state with `selectedTagIds: Set<string>`.
  `filterAndSortRecipes` (helpers.ts) takes `selectedTagIds` instead of `filterTag` and calls the
  same shared `matchesTagFilters` helper.
- `FilterBar.tsx`:
  - Favourites button: drop the `{t('recipes.filterFavourites')}` text, keep the star icon only
    (`aria-label` retains the text for a11y).
  - Add 4 new dropdown pills (Protein/Carb/Cuisine/Time), each `flex-1 min-w-0`, built as a new
    **`CategoryFilterDropdown.tsx`** component reusing the existing hand-rolled popover pattern
    from `TagRow.tsx`'s `TagPicker` (trigger button + `relative` wrapper + `absolute … z-50` panel
    + outside-`mousedown`-close). Panel lists that category's tags as checkboxes; label matches the
    mobile chip's summary logic (category name, or selected name(s) + `+N`).
  - Leftover tags (`groupTagsByCategory(allTags).other`) keep the existing `FilterTagButton`
    pills/`overflow-x-auto` row, now toggling membership in `selectedTagIds` instead of setting a
    single `filterTag`.
  - Layout: outer container becomes `flex flex-col md:flex-row md:items-center gap-2` — row 1
    (fav + 4 dropdowns, `flex items-center gap-2`) and row 2 (leftover tags,
    `flex items-center gap-2 overflow-x-auto`, `md:flex-1 md:min-w-0`) sit stacked by default and
    side-by-side at `md:` and up, matching "fav | dropdowns | tags" on desktop.
- `RecipeCard.tsx`: `onTagClick` prop becomes `onToggleTag: (tagId: string) => void` (toggles
  membership in `selectedTagIds` instead of replacing `filterTag`); `RecipeCardTag` calls it with
  the tag's id.
- `NoMatchingRecipesEmptyState.tsx`: `filterTag: boolean` prop becomes based on
  `selectedTagIds.size > 0` at the call site — component itself is unchanged.

### Edit/create tag picker — `src/components/TagRow.tsx`
- Inside `TagPicker`, replace the flat `filtered.map(...)` button list with
  `groupTagsByCategory(filtered)` rendered as labeled sections (small uppercase header per
  category, `Other` last), same trigger/click/create behavior as today.

## Verification
- Backend: run the API locally, confirm `tags` table gets the new `category` column and that
  `GET /tags` returns `category` for the newly-categorized defaults (Chicken → `protein`, Italian →
  `cuisine`, Quick → `time`, Vegetarian → `null`).
- Mobile: run the app (`/run` skill or `expo start`), open the Recipes list, confirm: favourites
  chip shows star only; the 4 dropdowns fill the row width; picking e.g. Chicken + Beef under
  Protein filters to recipes with either; combining a Protein pick with a Cuisine pick narrows
  further (AND across categories); the leftover tag row still scrolls and filters as before; open a
  recipe's edit view and confirm the tag picker modal now shows category-grouped sections.
- Web: run the dev server, repeat the same checks in the Recipes page filter bar at both a narrow
  and a wide (`md:`+) viewport to confirm the stacked-vs-single-row behavior, and check the
  edit/create tag picker's grouped sections in `AddRecipeModal`/`RecipeDetailModal`.
