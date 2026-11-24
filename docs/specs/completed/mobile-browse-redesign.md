# Spec: Mobile Browse redesign (list view)

Status: pending. Branch `feat/recipe-live-updates-edit-lock`, which already holds the uncommitted Home redesign (see `mobile-home-redesign-handoff.md`).

## Sources
- Design: Claude Design canvas https://claude.ai/artifact/QoRQGAvyX7tzj94kmzCZ1a, file `project/Mobile Screens.dc.html`, artboard `#browse-list`. Read it with the Artifact tool (`action: read`, `path`). The `Mobile - Browse.dc.html` page is exploration only.
- Tokens and component rules: `apps/mobile/DESIGN.md` (source of truth) and `apps/mobile/src/theme/`.
- Conventions: `~/.claude/CLAUDE.md`, the project `CLAUDE.md`, and `apps/mobile/AGENTS.md`.

## Scope
- List view only. The grid comes later, so build the row and pill primitives so a grid can reuse them.
- Navigation stays the native `NativeTabs`. Browse is the `role="search"` tab, so the "Search recipes…" pill in the mock is the native iOS search tab. Keep `headerSearchBarOptions` as they are.

## User decisions (2026-11-24)
1. **No + button on Browse.** Home owns adding. The empty-library CTA may still route to Home's add flow (`openAddRecipe=1`), as it does today.
2. **Sort stays a native iOS menu**, with a checkmark on the active option. Only the trigger is restyled: a 40px round `palette.control` button with the `arrow.up.arrow.down` symbol. Prefer a native header item (`unstable_headerRightItems` with a menu item, as `HomeScreen/useHomeHeader.tsx` does for Add) if the installed expo-router/react-native-screens supports menu items. Otherwise wrap `IconButton` in `@react-native-menu/menu`'s `MenuView`.
3. **Rows match the design exactly.** Remove the marquee title and tags and the household avatars. Delete `MarqueeSync` (and any marquee pieces) only if nothing else imports them. `RecipeDetailScreen/RelatedRecipesSection.tsx` uses marquee components, so keep whatever it needs.
4. **The list engine is Reanimated's `Animated.FlatList`** (it replaces FlashList) so rows can animate in, out and reflow via `itemLayoutAnimation`. Keep it fast:
   - memoised rows
   - `getItemLayout` with fixed row heights
   - stable callbacks
   - `removeClippedSubviews`
   - sensible `windowSize` / `initialNumToRender`

## Layout (from `#browse-list`)
- **Header:**
  - Native header, as today.
  - Title: `HouseholdHeaderTitle` (the household avatar with a caret, then "Browse"), styled the same as Home (`prominent`).
  - Right side: only the sort button.
- **Filter pills:**
  - Pinned under the header and floating over the list, as `FilterBar` does today.
  - Horizontal scroll with a 20px side gutter, 8px gap, and padding 4 on top and 12 on the bottom.
  - Height 38, radius `radius.control` (14), text 15/600, padding 14 on the left and 12 on the right.
  - Glass background (`GlassViewSafe`, fallback `rgba(255,255,255,0.82)`) with a soft shadow `0 2 12 rgba(40,30,20,0.12)`.
  - The favourites pill is a 38×38 square with a ★ glyph.
  - Category pill, inactive: the category name plus a small `chevron.down`. Tapping it opens the existing native multi-select menu, as `CategoryFilterChip` does today.
  - Category pill, active: solid `palette.action` with `palette.onAction` text showing the value ("Chicken", or "Chicken +1"), plus an ✕. The ✕ is its own hit target and clears that category. Tapping the label still opens the menu.
  - "Other" tags stay as single toggle pills after a divider, with the same active styling but no chevron or ✕.
- **Count line:** under the pills, with padding 0 20 4. On the left, "N recipes" (plural i18n); on the right, the active sort label. Text 14, `palette.textSecondary`. Hide it while search is active.
- **Recipe row** (`RecipeRow`):
  - Row container:
    - Horizontal: 20px gutter.
    - Vertical: padding 12, gap 12.
    - Bottom hairline: `palette.dividerCard`.
  - 88px thumbnail with radius `radius.control`.
  - Body column, with a 4px gap:
    - Title: `typography.cardTitle` (17/600), 2 lines max.
    - Meta: "25 min · 600 kcal" (`typography.meta`, `textSecondary`). Build it from `total_time_minutes` and `kcal_per_serving` and drop whichever is missing. If both are missing, render nothing. Units go through i18n.
    - Tag line, on one line:
      - up to 2 tags as tint pills (13/600, `palette.tint` background with `palette.actionText` text, radius 10, padding 3×9, ellipsis)
      - then a "+N" neutral pill (`palette.control` background with `textSecondary` text) if there are more tags
      - no tags means no tag line
  - A star on the right in a 40×40 hit area (minimum 44 using `hitSlop`). The symbol is 22, `star.fill` in `palette.action` when favourited, otherwise `star` in `palette.placeholder`.
  - Press scales the row (`usePressScale`). Long press keeps the existing action.
  - Search mode reuses the same row; there is no separate "plain" variant any more.
- **Empty states:**
  - When filters match nothing: "No recipes match" (17/600) and a primary `Button` "Clear filters".
  - When the library is empty: keep today's copy with a primary `Button` that routes to Home's add flow.
  - Use the shared `Button` and drop the hand-rolled Pressables.
- Keep the semantic-search sections ("Suggested", plus the loading row) and the no-results row, restyled with theme tokens.

## Reusable components (`apps/mobile/src/components/ui/`, exported from `index.ts`)
Each component is driven by variants and uses theme tokens only, with no raw numbers or colours outside the theme, except values the design sets that have no token yet. Add a token for those.
- `Pill`: a static label pill. Props `tone: 'tint' | 'neutral'` and `size: 'sm' | 'md'`, where `sm` is 13/600 with radius 10 (row tags) and `md` is 14/500 with radius 14 (Recipe Details tags later). It replaces the row tag markup.
- `FilterPill`: a glass, pressable filter pill. Props: `label?`, `icon?` (SF symbol, for the ★-only square), `active`, `trailing?: 'chevron' | 'clear' | 'none'`, `onPress`, `onClear?`. Active styling animates (see Motion). It replaces `GlassChip`, `TagChip` and the chip inside `CategoryFilterChip`. `CategoryFilterChip` stays as the menu wrapper around a `FilterPill`.
- `FavouriteButton`: a star toggle with the press "pop" and haptic. The grid tiles will reuse it.
- `RecipeRow`: the row above. It is presentational: it takes the recipe plus `onPress`, `onLongPress` and `onToggleFavourite` taking an id, and exports `RECIPE_ROW_HEIGHT` for `getItemLayout`.
- Extend `Thumbnail` only if it needs to change; it already supports `size="row"` and `radiusKey`.
- Remove any new token or variant that nothing uses.

## Motion
Follow the Home rule from the user: plain timing and fades, **no springy or bouncy layout animations**. Use `theme/motion.ts` (`useMotion`, `layout`, `enterFade`, `exitFade`, `usePressScale`) and honour Reduce Motion.
- **Rows:**
  - Rows on the first load: no stagger cascade.
  - Rows that appear later, from a live update, unfavouriting or a filter change: `FadeIn`.
  - Removed rows: `FadeOut`.
  - The rest reflow with `LinearTransition` (`layout`, 200ms), via the `Animated.FlatList` `itemLayoutAnimation`.
  - Make sure a big filter change doesn't stutter. If it does, skip exiting animations when more than ~20 rows leave at once.
- **Filter pill toggling active:**
  - Background and text colour cross-fade (`withTiming` ~180ms).
  - The ✕ fades in and out.
  - The pill width change animates with `layout`.
- **Favourite star:** a small scale pop (timing 1 → 1.2 → 1, ~200ms in total, not a spring) plus a light haptic. The optimistic toggle stays as `useRecipeActions` has it.
- **Count line:** the number cross-fades when it changes. Keep this subtle.
- **Opening a recipe:** if the installed expo-router supports the native iOS zoom transition (`Link.AppleZoom` / `Link.AppleZoomTarget` or equivalent), zoom from the row thumbnail into the Recipe Details hero. Check `node_modules/expo-router` for the API before using it. If it isn't available, keep the normal native push and say so in the report.

## Behaviour to keep
- Filters and their persistence (`useBrowseFilters`), presets from Home (`recent`, `favourites`), and scroll-to-top when filters change.
- Literal search plus semantic "Suggested" results, and `useDeferredValue` on the query.
- Favourite overrides and optimistic toggling, and the long-press actions (`useRecipeActions`).
- The household switcher menu and the loading and error states.
- Repeat-tap safety: toggles must not double-fire, and the ✕ must not also trigger the menu.

## Cleanup
Delete whatever the redesign makes dead:
- `RecipeCard.tsx`, `GlassChip.tsx`, `TagChip.tsx`
- avatar helpers (`buildHouseholdAvatars`, `HouseholdAvatar`)
- the `CARD_*` constants
- styles nothing uses, and unused i18n keys (grep mobile, web and shared before removing a key)

Add new i18n keys to all 7 locales: en, pl, de, fr, es, it, pt.

## Done when
- `npx tsc --noEmit` passes in `apps/mobile`.
- The UI matches `#browse-list` in light mode and looks right in dark mode.
- Animations behave as described, including under Reduce Motion.
- The user confirms on device. Nothing is committed before that.
