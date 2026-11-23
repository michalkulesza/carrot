# Home and Browse tabs (mobile)

## Context
The Recipes tab mixes a dashboard (next meal, imports in progress, add button) with the full recipe library
(list, filter chips, sort, search in the top navigation bar), and its search feels sluggish. iOS 26 has a
dedicated search tab (`role="search"`): a separate round button on the right of the tab bar that turns into a
search field at the bottom when tapped. We use it for a **Browse** tab that holds the library and its search,
and turn the first tab into a **Home** dashboard that can later grow social sections.

Priorities: **performance, smoothness and UI/UX** of browsing and search come first. Mobile only; web unchanged.

## Decisions
- Search tab = **Browse**: full recipe list, filter chips, favourites chip, sort menu, household picker,
  semantic ("similar recipes") results. Search lives in the tab bar (iOS 26) instead of the top header.
- First tab = **Home**, built only from existing data: next meal, imports in progress, Recently added,
  Favourites, the + button.
- "Most cooked" / "Highest rated" need new data (cook tracking, ratings) → backlog in `docs/TODO.md`.

## Performance and smoothness (Browse) — required
Problems in today's `RecipesScreen/index.tsx` and the fix for each:
1. **Per-keystroke full recompute on the JS thread.** Filter with `useDeferredValue(query)` so the native field
   stays instant and the list updates at lower priority. Precompute a normalized (lowercased, accent-stripped)
   title per recipe once in a `useMemo` keyed on the recipe list, not per keystroke. Sort once per
   `recipes`/`sort` change; filtering only narrows the already-sorted array.
2. **Layout animations on every row during search.** Drop `layout={LinearTransition}` and `exiting` from list
   rows. Keep only `entering` for genuinely new recipes (import finished), never while a query is active.
3. **Rows re-render on every parent render.** Extract `RecipeCard` into its own file wrapped in `React.memo`,
   with primitive/stable props (`recipe`, `isFavourite`, `householdAvatars`) and id-based callbacks
   (`onPress(id)`, `onLongPress(id)`, `onToggleFavourite(id)`) created once with `useCallback`. Precompute a
   `householdsById` map instead of `households.find` per row. No inline closures or style functions in rows.
4. **Marquee cost.** Marquee measures twice per row on mount. While a query is active, render titles/tags as
   plain one-line truncated `Text` (no marquee, no sync slots); keep marquee for idle browsing only.
5. **Header chrome animated via `marginTop`** (relayout every frame). Do not animate layout properties. While
   searching, swap `ListHeaderComponent` to nothing (or a compact results header) in one render; if a transition
   is kept, use opacity/transform only. Don't clear filters in the same frame as the focus animation; search
   simply ignores tag/favourite filters while a query is active, and they come back untouched on cancel.
6. **Semantic results jumping in.** Keep the literal results in place and append the "Similar recipes" section
   below without shifting existing rows; show a small inline loading row in that section's place instead of a
   footer that appears/disappears. Debounce stays at 350 ms; keep previous semantic results visible
   (`placeholderData: keepPreviousData`) while the next query loads to avoid flicker.
7. **List tuning.** Fixed-height cards → `getItemLayout`; `keyboardDismissMode="on-drag"`,
   `keyboardShouldPersistTaps="handled"`; sensible `windowSize`/`maxToRenderPerBatch`/`initialNumToRender`;
   `removeClippedSubviews` on iOS only if it doesn't break images.
8. **Feedback.** Light haptic only on explicit actions (cancel, open recipe), never per keystroke. Empty results:
   clear "No recipes for “query”" state with the similar-recipes section still allowed below.

Measure before/after on a device with ~200+ recipes (React DevTools profiler or the perf monitor): typing must
not drop frames and each keystroke's commit should stay well under one frame of JS time.

## Routes (`apps/mobile/app/(tabs)/`)
- Rename `recipes/` → `home/` (`_layout.tsx` + `index.tsx`), rendering the new `HomeScreen`.
- New `browse/` (`_layout.tsx` + `index.tsx`), rendering `BrowseScreen`.
- `_layout.tsx` tab order: Home, Meal plan, Shopping, Settings, Browse (search tab **last**, so iOS 26 shows it
  as the separate button):
  ```tsx
  <NativeTabs.Trigger name="browse" role="search">
    <NativeTabs.Trigger.Label>{t('nav.browse')}</NativeTabs.Trigger.Label>
  </NativeTabs.Trigger>
  ```
  Gated (no households) the same way as the other tabs. Home icon: `sf="house"` / `md="home"`.
- Update every `/(tabs)/recipes` reference to `/(tabs)/home`: `app/(tabs)/index.tsx` redirect, `app/share.tsx`
  (incl. its `Destination` type and the `openAddRecipe` param), `src/screens/WebViewImportScreen.tsx`,
  `src/screens/RecipeDetailScreen/index.tsx` fallback, `src/lib/notificationDestination.ts` (`recipe_failed`).

## Browse (`src/screens/BrowseScreen/`, from `RecipesScreen/` via `git mv`)
- Keep: list, filter chips, favourites chip, sort/filter header menu (`HeaderRight`), household picker title
  (`HeaderTitle`), `headerSearchBarOptions` (no forced `placement`; on iOS 26 a `role="search"` tab shows it in
  the tab bar; on iOS < 26 it stays in the Browse header), semantic search, favourite overrides,
  long-press action sheet.
- Title `t('nav.browse')`.
- Remove from Browse: import job cards, `NextMealCard`, `FloatingAddButton`, `AddRecipeDrawer`,
  `openAddRecipe` handling, `useOpenAndPaste`. The empty-state "add recipe" action navigates to
  `/(tabs)/home?openAddRecipe=1`.

## Home (`src/screens/HomeScreen/`)
Header: `HeaderTitle` (household picker) with title `t('nav.home')`, no search bar, no sort menu.
Sections, each hidden when empty:
1. `NextMealCard` (moved).
2. **Imports in progress**: `PendingJobCard`s from `useImportJobs` with retry/import-anyway/cancel/dismiss and
   the `dismissPresentedByCollapseId('import:<id>')` cleanup (moved as-is).
3. **Recently added**: horizontal row, up to 10 recipes, newest `created_at` first.
4. **Favourites**: horizontal row of favourite recipes.
   Section header (13pt footnote style) with "See all" → `router.navigate('/(tabs)/browse')`. Compact card:
   `ThumbnailImage` + one-line title, `React.memo`, tap → `/recipe/<id>`. Horizontal rows use `FlatList` with
   `getItemLayout` and `showsHorizontalScrollIndicator={false}`.
- Empty library (no recipes, no imports): empty state with an "Add recipe" button opening the drawer.
- `FloatingAddButton` + `AddRecipeDrawer` + `openAddRecipe` + `useOpenAndPaste` move here unchanged.
- Keep the "new recipe arrived" success haptic on Home.
- Shared pieces (`ThumbnailImage`, `HeaderTitle`, household menu logic, `RecipeCard`) go to `src/components/`
  when both screens use them; no duplication.

## Translations (all 7: en, pl, de, fr, es, it, pt)
`nav.home`, `nav.browse`, `home.recentlyAdded`, `home.favourites`, `home.importsInProgress`, `home.seeAll`,
`home.emptyTitle`, `home.emptyBody`, `browse.noResults` (with `{{query}}`), reusing existing keys where an
identical string exists. Remove `nav.recipes` only if nothing else uses it.

## Backlog (`docs/TODO.md`)
Add: Home "Most cooked" (needs cook tracking), Home "Highest rated" (needs ratings), Home social feed.

## Verification
- `cd apps/mobile && npx tsc --noEmit`.
- Device (iOS 26): Home, Meal plan, Shopping, Settings + separate round search button; tapping it opens Browse
  with the field in the bottom bar; typing fast stays smooth (no dropped frames, no row animations), similar
  recipes append below without shifting rows; cancel restores filters and scroll position.
- iOS < 26: Browse is a normal fifth tab with the search bar in its header.
- Home: next meal, imports in progress (retry/dismiss), Recently added, Favourites, See all → Browse,
  + button and share-sheet import open the drawer on Home.
- "Import failed" notification tap → Home; deleted-recipe fallback → Home.
