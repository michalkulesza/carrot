# Recipes screen — hand the header/tag-bar layout back to UIKit

Status: planned · scope: `apps/mobile/src/screens/RecipesScreen/` only

## Context

The Recipes screen reimplements in JS what UIKit already does natively. It measures the navigation
bar, guesses how much the search bar adds to it, pushes list content down with a hand-built spacer,
and positions the tag/filter bar as an absolute overlay at `top: headerHeight`.

Two user-visible defects come out of that:

1. **Elements jump on load.** On the first frame the list's top spacer is ~48pt too short, so the
   first recipe card renders under the tag bar and snaps down a frame later.
2. **Elements don't follow the search bar.** Entering/leaving search mode, the tag bar and list
   content visibly drift out of step with UIKit's own search-bar reveal instead of moving with it.

Both are symptoms of one root decision: `contentInsetAdjustmentBehavior="never"` on the recipe
`FlatList`, which opts the screen out of the native content inset and forces everything above to be
recreated by hand.

## Current implementation (what exists today)

`apps/mobile/src/screens/RecipesScreen/index.tsx`:

| Piece | Line (approx.) | What it does |
|---|---|---|
| `useHeaderHeight()` → `headerHeightSV` | 148-149 | JS header height mirrored into a Reanimated shared value |
| `tagBarHeightSV` | 150 | **initialised to `0`**, filled by the tag bar's `onLayout` (line 862) |
| `tagBarVisibleSV` | 151 | 1 → 0 fade when search focuses |
| `collapsedHeaderHeightRef` / `searchBarHeightRef` / `isSearchActiveRef` | 152-154 | the "learned search-bar delta" state machine |
| AsyncStorage load effect | 156-166 | reads the persisted delta |
| calibration effect | 368-383 | writes the delta back, snaps `headerHeightSV` |
| `animateHeaderHeight` | 385-395 | `withTiming(300, Easing.out(cubic))` toward the learned expanded height |
| `handleSearchFocus` / `handleSearchBlur` | 396-412 | fire that timing from the native `onFocus`/`onBlur` |
| `tagBarPositionStyle` | 802-805 | `top: headerHeightSV`, `opacity: tagBarVisibleSV` |
| `topSpacerStyle` | 806-808 | `height: headerHeightSV + tagBarHeightSV * tagBarVisibleSV` |
| `contentInsetAdjustmentBehavior="never"` | 839 | opts out of native insets |
| spacer in `ListHeaderComponent` | 843 | the manual stand-in for the header inset |
| `{!isSearching && <NextMealCard />}` | 844 | unmounts a ~72pt card in a single frame |
| tag bar overlay | 860-883 | `Reanimated.View`, absolute, `onLayout` |

`apps/mobile/src/screens/RecipesScreen/helpers.ts:1-9` holds the persisted-delta constants
(`SEARCH_BAR_HEIGHT_DELTA_STORAGE_KEY`, `learnedSearchBarHeightDelta`,
`setLearnedSearchBarHeightDelta`).

`apps/mobile/src/screens/RecipesScreen/styles.ts:43-49` — `tagBar` is `position: absolute` with
`paddingTop: 0` (dead) and `paddingBottom: 16`.

The route's stack is `headerTransparent: true` (`apps/mobile/app/(tabs)/recipes/_layout.tsx`), which
is why content is expected to sit under the header in the first place.

## Root causes (verified in library source)

**1. The load jump is `tagBarHeightSV` starting at `0`.**
`useSharedValue(0)` + `onLayout` means frame one computes `topSpacerStyle` with a zero-height tag
bar. The correction arrives on the next layout pass — that is the snap.

**2. The search-mode drift is a debounce inside React Navigation.**
`@react-navigation/native-stack@7.17.3`, `src/views/NativeStackView.native.tsx:315-334`:

```js
// Only debounce if header has large title or search bar
// As it's the only case where the header height can change frequently
const doesHeaderAnimate =
  Platform.OS === 'ios' &&
  (options.headerLargeTitleEnabled || options.headerSearchBarOptions);

if (doesHeaderAnimate) {
  setHeaderHeightDebounced(headerHeight);   // debounce(setHeaderHeight, 100)
```

So `useHeaderHeight()` on a screen with `headerSearchBarOptions` is a **100 ms-debounced React state
update**, which then requires a re-render of the whole recipe list before the new height reaches the
UI thread. That is exactly the lag the current code documents at `index.tsx:363-367` and works
around with a learned constant. The workaround can never match UIKit's curve, and is simply wrong on
the first-ever search tap on a fresh install (nothing learned yet → `animateHeaderHeight` returns
early at line 388).

**3. Both problems have a native answer that the screen doesn't use.**

- **List content**: `contentInsetAdjustmentBehavior="automatic"` makes UIKit own the top inset. It is
  updated inside the same animation block as the nav bar, so content tracks the search bar exactly.
  This already works elsewhere in this app under the identical `headerTransparent: true` stack —
  `MealPlanScreen/index.tsx:251`, `SettingsScreen/index.tsx:332`, `HouseholdDetailScreen.tsx:295` —
  none of which carry a manual header spacer.
- **Pinned overlay**: `useAnimatedHeaderHeight()`, exported from `@react-navigation/native-stack`
  (`src/index.tsx:18`; the package is a direct dependency of `apps/mobile`). It returns an
  `Animated.AnimatedInterpolation<number>` fed by the native `onHeaderHeightChange` event through
  `Animated.event(..., { useNativeDriver: true })` (`NativeStackView.native.tsx:241-248, 298-314`) —
  **undebounced and driven on the UI thread**. Consumed as
  `transform: [{ translateY: animatedHeaderHeight }]` it stays native-driver-eligible, so the tag bar
  keeps following the header even while the JS thread renders the list.

Rejected alternative, for the record: `stickyHeaderIndices` cannot pin the tag bar here. RN's sticky
implementation interpolates raw `contentOffset.y` with no content-inset term
(`react-native/Libraries/Components/ScrollView/ScrollViewStickyHeader.js:200-220`), so under a
transparent header a sticky row would pin *behind* the nav bar.

## Decisions (confirmed with the user)

| Question | Decision |
|---|---|
| Tag bar behaviour | **Stays pinned** under the nav bar, as today. |
| Search field | **Always visible** — `hideWhenScrolling: false`. Header height then changes only on focus/blur, not on scroll. |

## Implementation

### 1. `index.tsx` — list uses the native content inset

- Change `contentInsetAdjustmentBehavior="never"` → `"automatic"` (line 839).
- Delete `topSpacerStyle` (806-808). The header term disappears entirely; the only top spacing left
  is the room reserved for the pinned tag bar overlay.
- In `ListHeaderComponent`, the spacer becomes tag-bar-only:

```tsx
const tagBarSpacerStyle = useAnimatedStyle(() => ({
  height: tagBarHeightSV.value * tagBarVisibleSV.value,
}))
```

### 2. `index.tsx` — tag bar position comes from the native header height

- `import { useAnimatedHeaderHeight } from '@react-navigation/native-stack'` and
  `const animatedHeaderHeight = useAnimatedHeaderHeight()`.
- Delete: `useHeaderHeight` import + call, `headerHeightSV`, `collapsedHeaderHeightRef`,
  `searchBarHeightRef`, `isSearchActiveRef`, the AsyncStorage load effect (156-166), the calibration
  effect (368-383) with its comment block, `animateHeaderHeight` (385-395), and the `AsyncStorage`
  import.
- The overlay becomes two nested views — one per animation system. **Do not put an RN
  `Animated.Value` and a Reanimated shared value in the same style object**; they are separate
  drivers and mixing them in one style is unsupported.

```tsx
const tagBarOpacityStyle = useAnimatedStyle(() => ({ opacity: tagBarVisibleSV.value }))
const tagBarTransform = { transform: [{ translateY: animatedHeaderHeight }] }

<Animated.View                                   // react-native Animated
  style={[styles.tagBar, tagBarTransform]}
  onLayout={(e) => { tagBarHeightSV.value = e.nativeEvent.layout.height }}
  pointerEvents={isSearching ? 'none' : 'auto'}
>
  <Reanimated.View style={tagBarOpacityStyle}>
    <ScrollView horizontal ...>{/* unchanged children */}</ScrollView>
  </Reanimated.View>
</Animated.View>
```

  Note the existing file imports Reanimated as the default export named `Reanimated`; add
  `Animated` from `react-native` for the outer view (or alias it — just keep the two systems
  visually distinguishable).

- `handleSearchFocus` / `handleSearchBlur` keep only the `tagBarVisibleSV` timing plus the existing
  state resets (`setIsSearching`, `setSelectedTagIds`, `setFilterFavourites`, haptics). Neither
  touches header height any more. Keep the existing ordering comment at 397-400 — the reason it
  fires the shared-value mutation before `setState` still applies.

### 3. `index.tsx` — no zero-height first frame

```tsx
// Chip row (28pt) + styles.tagBar paddingBottom. Seeds the shared value so the list reserves the
// right room on the first frame; onLayout still corrects it for Dynamic Type.
const TAG_BAR_HEIGHT = 48
const tagBarHeightSV = useSharedValue(TAG_BAR_HEIGHT)
```

Keep the `onLayout` assignment as a correction — it just no longer starts from `0`.

### 4. `index.tsx` — search bar options

Add `hideWhenScrolling: false` to the `headerSearchBarOptions` object (line 415-422). Native insets
make UIKit's collapse-on-scroll active again; per the decision above the field stays visible, which
also keeps the header height constant while scrolling.

### 5. `index.tsx` — `NextMealCard` must not pop

`{!isSearching && <NextMealCard />}` (line 844) removes a ~72pt card in one frame on search focus —
a jump in its own right. Wrap it using the same pattern already applied to recipe rows
(`index.tsx:678-682`):

```tsx
{!isSearching && (
  <Reanimated.View entering={FadeInDown.duration(250)} exiting={FadeOut.duration(250)}>
    <NextMealCard enabled={dataQueriesEnabled} />
  </Reanimated.View>
)}
```

so it fades in step with the tag bar instead of disappearing instantly.

### 6. `helpers.ts` — delete the learned-delta machinery

Remove `SEARCH_BAR_HEIGHT_DELTA_STORAGE_KEY`, `learnedSearchBarHeightDelta`,
`setLearnedSearchBarHeightDelta` and the block comment above them (lines 1-9). `SortMode` and
`SORT_OPTIONS` stay. Update the import list in `index.tsx:48-54` accordingly.

### 7. `styles.ts`

`tagBar`: add `top: 0` (position now comes from the transform), drop the dead `paddingTop: 0`.

## Constraints for the implementer

- Nothing outside `apps/mobile/src/screens/RecipesScreen/` changes. `app/bug-report.tsx` keeps its
  own `useHeaderHeight` usage; the other tab stacks are untouched.
- `Animated.add` and `translateY` are both native-driver-supported — do not wrap
  `animatedHeaderHeight` in anything that forces it back onto the JS driver, and do not attach a
  `.addListener` to it.
- `useAnimatedHeaderHeight()` initialises to `getDefaultHeaderHeight(frame, isModal, topInset)`,
  which is exact for this non-large-title header, so frame one is already correct. React Navigation
  notes a Fabric quirk where the *initial* native notification can be missed
  (`NativeStackView.native.tsx:300-304`); that only matters when the real initial height differs
  from the default, which it does not here.
- Follow the repo conventions: no new comments unless the *why* is non-obvious, extract multi-line
  inline JSX/callbacks into named values, and remove any code left unused by this change.

## Verification

1. Typecheck: `pnpm --filter mobile exec tsc --noEmit`. Must be clean — this also proves there are no
   stale references to the deleted helpers.
2. Run on an iOS device/simulator (`pnpm ios`, or `pnpm be:ios` for API + app) and check the Recipes
   tab:
   - **Cold load** — recipe cards must not shift after the first frame; the first card sits directly
     below the tag bar immediately.
   - **Search focus** — tap the field. Tag bar and list must ride down with the expanding header as
     one motion: no lag, no double-step, no snap at the end.
   - **Fresh install** — delete the app first and search on the very first launch. This is the case
     the old learned-delta path got wrong.
   - **Search cancel** — same in reverse; the bar returns pinned under the header.
   - **Scrolling** — search field and tag bar stay put; the nav bar's scroll-edge blur should now
     engage correctly (it depends on the native inset that `"never"` was suppressing).
   - **Rotation and Dynamic Type** — rotate, then raise the system text size; the `onLayout`
     correction should re-reserve the right room.
3. Confirm the other tabs are unaffected (Meal Plan / Settings already use `automatic`).
