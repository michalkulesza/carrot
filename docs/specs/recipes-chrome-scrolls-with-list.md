# Recipes header chrome scrolls with the list — and the Add Recipe drawer gets its full height

Status: ready to implement

Supersedes v1 §2 and v2 §A/§B of
[`completed/recipes-header-layout-native-insets.md`](completed/recipes-header-layout-native-insets.md).
That spec's pinned-overlay design rests on two assumptions that are false on device; both are
documented below so nobody retries them.

| Part | Scope | What it fixes |
|---|---|---|
| **A** | `apps/mobile/src/screens/RecipesScreen/` | Tag bar rests one search-bar-height too high on load |
| **B** | `apps/mobile/src/screens/RecipesScreen/` | After an open/cancel search cycle the next-meal card vanishes and rows sit under the chips |
| **C** | `apps/mobile/src/components/AddRecipeDrawer/` | Drawer is too short — the share tip is cut off |

A and B are one edit to the same two files and must land together. C is independent.

## Context

Three defects reported on iOS 26 (screenshots taken 2026-07-28):

1. **Recipes, cold load** — the filter chips (`★ Protein Carb Cuisine Time…`) render *behind* the
   search field instead of below it.
2. **Recipes, after opening and cancelling search** — the next-meal card is gone and the first list
   row overlaps the chip row.
3. **Add Recipe drawer** — the sheet is too short; the "Did you know? In Safari, Instagram, or any
   app —" tip is clipped by the bottom of the screen.

## Root causes (verified)

### 1. `useAnimatedHeaderHeight()` starts without the search bar

`expo-router/build/react-navigation/native-stack/views/NativeStackView.native.js`:

```js
const defaultHeaderHeight = useFrameSize((frame) => Platform.select({
  default: getDefaultHeaderHeight(frame, isModal, topInset),   // :104 — nav bar only
}));
const rawAnimatedHeaderHeight = useAnimatedValue(defaultHeaderHeight);   // :124
```

`getDefaultHeaderHeight` knows nothing about `headerSearchBarOptions`, so the animated value starts
~55pt short. The native `onHeaderHeightChange` event that would correct it does not reach the
Animated node on the first appearance — the library says so itself at `:161-165` ("On Fabric,
there's a bug where native event drivers for Animated objects are created after the first
notifications about the header height from the native side").

The old spec assumed the opposite ("that only matters when the real initial height differs from the
default, which it does not here"). It does differ, by the entire search field.

Measured from the load screenshot (≈2.03 px/pt): chips centred at ~104pt while the search field
occupies 111-145pt — the overlay is sitting at nav-bar height. The *list* content starts at ~211pt,
i.e. correctly inset below the search field. **UIKit's automatic content inset is right; only the
JS overlay is wrong.** A focus/blur cycle produces further header-height events, which is why the
bar snaps into place afterwards and looks fine from then on.

### 2. The chrome window measures itself through its own animation

`RecipesScreen/index.tsx` (current) measures `headerChromeHeightSV` with an `onLayout` on the view
*inside* the clipping window whose height that same shared value drives:

```tsx
<Reanimated.View style={[styles.headerChromeWindow, headerChromeWindowStyle]}>   // height = SV * (1 - progress)
  <Reanimated.View onLayout={(e) => { headerChromeHeightSV.value = ... }}>       // measured here
```

One intermediate frame reported through that loop poisons the value permanently. Measured after an
open/cancel cycle: the window settles at ~40pt instead of ~132pt, so `overflow: 'hidden'` clips the
next-meal card away entirely and the rows below move up under the chips.

The overlap is visible at all because `styles.tagBar` has no background — the native blur covers the
nav bar and search field only, so anything scrolled beneath the overlay shows straight through it.

### 3. The drawer is exactly as tall as configured

`@gorhom/bottom-sheet@5.2.14`, `lib/module/hooks/useAnimatedLayout.js`: for a modal,
`containerHeight = rawContainerHeight - (topInset + bottomInset)`, and percentage snap points are
taken against that (`utilities/normalizeSnapPoint.js`). With `SNAP_POINTS = ['65%']` and
`topInset={insets.top}` (59pt) on an 852pt screen that is 515pt of sheet, against roughly 556pt of
picker content:

| Piece | Height |
|---|---|
| handle | ~24 |
| `quickUrlSection` (paddingTop 8 + 44 input + gap 10 + button ~48) | ~110 |
| `pickerWrap` paddingTop + 5 × `methodRow` (minHeight 64) + gap | ~348 |
| `shareTipCard` | ~58 |
| `container` paddingBottom | 16 |

Nothing is mispositioned by an inset bug — the sheet is simply too short for its tallest subview.

## Decisions (confirmed with the user)

| Question | Decision |
|---|---|
| Tag bar behaviour | **Scrolls with the list.** It moves into `ListHeaderComponent`, so UIKit's automatic content inset places it and no header height is consulted anywhere on this screen. It scrolls away under the real blurred nav bar, which is also why content can no longer overlap it. |
| Drawer height | **Raise the fixed snap point** (keep one height for every subview) rather than switching to dynamic sizing. |

Rejected, for the record: keeping the bar pinned. It would need a JS `BlurView` faking nav-bar
chrome plus a second source of truth for the header height (`useHeaderHeight()` — JS state, 100 ms
debounced). iOS exposes no RN-reachable API for a pinned bar below the search field, so a pinned
version can only ever approximate the native material.

## Implementation

### A1. `RecipesScreen/index.tsx` — chips move into the list header

Delete the overlay block (currently `index.tsx:850-875`):

```tsx
<Animated.View style={[styles.tagBar, tagBarTransform]} onLayout={handleTagBarLayout} …>
  <Reanimated.View style={tagBarChromeStyle}>
    <ScrollView horizontal …>{favChip}{TAG_CATEGORIES.map(…)}{…renderTag}</ScrollView>
  </Reanimated.View>
</Animated.View>
```

and re-mount its `ScrollView` — unchanged children: `favChip`, the `CategoryFilterChip` row, the
divider, `groupedFilterTags.other.map(renderTag)` — inside a plain `<View style={styles.tagBar}>` as
the first child of the list header (A2).

Remove, now unused:

- `useAnimatedHeaderHeight` (import from `expo-router/build/react-navigation/native-stack` + call)
- `Animated` from `react-native`
- `tagBarTransform`, `tagBarChromeStyle`, `tagBarRoomStyle`, `tagBarHeightSV`, `handleTagBarLayout`
- the `TAG_BAR_HEIGHT` and `NEXT_MEAL_CARD_HEIGHT` constants
- `const insets = useSafeAreaInsets()` (`index.tsx:146`) and its import — already dead today; the
  list uses a plain `paddingBottom: 88` for FAB clearance and the native inset covers the tab bar

### A2. `RecipesScreen/index.tsx` — collapse the chrome with a negative margin

One view, measured at its natural height, replacing the window/content pair:

```tsx
const searchProgress = useSharedValue(0)
const headerChromeHeightSV = useSharedValue(0)

const headerChromeStyle = useAnimatedStyle(() => ({
  marginTop: -headerChromeHeightSV.value * searchProgress.value,
  opacity: 1 - searchProgress.value,
}))
```

```tsx
ListHeaderComponent={
  <Reanimated.View
    style={headerChromeStyle}
    onLayout={handleHeaderChromeLayout}
    pointerEvents={isSearching ? 'none' : 'auto'}
  >
    <View style={styles.tagBar}>{/* chip ScrollView from A1 */}</View>
    <NextMealCard enabled={dataQueriesEnabled} />
  </Reanimated.View>
}
```

Why this is safe where the clipping window was not: `marginTop` does not affect the view's own
measured height, so `onLayout` always reports the true chrome height — no feedback loop, and no seed
constant is needed either, because at rest `searchProgress` is `0` and the margin is `0` whatever
the shared value holds. Shrinking the margin lifts every row below it on the same curve, and the
chrome slides up under the real blurred header (the stack is `headerTransparent: true`), which is
the motion v2 was after.

`handleHeaderChromeLayout`, `handleSearchFocus`, `handleSearchBlur`, `SEARCH_TRANSITION` and the
"kick the animation off before any setState" comment are unchanged. Nothing unmounts, as before.

### A3. `RecipesScreen/styles.ts`

- `tagBar`: drop `position: 'absolute'`, `top: 0`, `left: 0`, `right: 0`; keep `paddingBottom: 16`.
- Delete `headerChromeWindow` — there is no clipping window any more.

### C1. `components/AddRecipeDrawer/index.tsx`

`SNAP_POINTS = ['65%']` → `['88%']`. 88% of `screen − topInset` ≈ 698pt on a 6.1" device, which
clears the ~556pt picker with headroom for Dynamic Type and the five-method variant (the
personal-library row is conditional). Extend the existing comment above `SNAP_POINTS` with the
"sized for the tallest subview" reason instead of adding a second comment.

## Constraints for the implementer

- Nothing outside `RecipesScreen/` and `AddRecipeDrawer/` changes. Meal Plan and Settings already use
  `contentInsetAdjustmentBehavior="automatic"` and share no code with this.
- Keep `contentInsetAdjustmentBehavior="automatic"` and `hideWhenScrolling: false` — the whole design
  depends on UIKit owning the top inset.
- Do not reintroduce a header-height measurement (`useHeaderHeight`, `useAnimatedHeaderHeight`, or a
  learned constant) on this screen. If a future change appears to need one, re-read root cause 1.
- Never call `onLayout` on a view whose measured dimension is itself driven by an animated value
  derived from that measurement (root cause 2).
- Repo conventions apply: no comments unless the *why* is non-obvious, named consts/handlers instead
  of inline multi-line expressions, and delete anything this change leaves unused.
- `index.tsx` is ~880 lines. Splitting it is a separate task — do not fold a refactor into this fix.

## Verification

1. `pnpm --filter mobile exec tsc --noEmit` — clean; also proves no stale references to the deleted
   shared values and constants.
2. `pnpm ios` (or `pnpm be:ios`), Recipes tab:
   - **Cold load** — chips sit directly under the search field on the *first* frame, next-meal card
     under the chips, first recipe card under that. This is defect 1.
   - **Search focus** — chips and card slide up under the header and fade as one motion while the
     rows rise to meet them; no discrete step, no lag.
   - **Cancel search** — chips and card return to exactly their load position; the card shows real
     content, never a skeleton (proof it was never unmounted); no row is left under the chips.
     Repeat the cycle 3-4 times — defect 2 only appeared after a cycle.
   - **Scroll** — chips scroll away under the nav bar and are blurred by it; the search field stays
     put; the nav bar's scroll-edge effect engages.
   - **Rapid toggle** — focus and cancel before each animation finishes; the chrome must never end up
     half-collapsed.
   - **Dynamic Type** — raise the system text size, then repeat focus/cancel; the chrome must still
     collapse to exactly zero (the `onLayout` measurement, not a constant, guarantees this).
3. Add Recipe drawer, opened from the FAB *and* from the empty-state button: the whole picker
   including the share tip is visible without scrolling; the backdrop is still visible above the
   sheet; text-paste and personal-library subviews open at the same height.
4. Meal Plan and Settings tabs unaffected.
