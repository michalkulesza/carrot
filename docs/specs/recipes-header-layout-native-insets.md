# Hand screen layout back to UIKit — Recipes, then Meal Plan

Status: planned

| Part | Scope | What it fixes |
|---|---|---|
| **v1** | `apps/mobile/src/screens/RecipesScreen/` | Content jumps on load; tag bar and list don't track the search bar |
| **v2** | `apps/mobile/src/screens/RecipesScreen/` | Entering search mode plays three uncoordinated motions; the next-meal card pops |
| **v3** | `apps/mobile/src/screens/MealPlanScreen/` | *Today* button jumps; centre-on-today lands wrong and then jumps up |

v1 → v2 must land in order (v2 builds on v1's structure). v3 is independent of both.

## Context (v1)

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

> **Superseded by v2 below.** Implement v2 §A instead of this section; it is kept for context on
> what was tried first and why it is not enough.

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

---

# v2 — entering search mode must be one motion, not three

## Why v1 isn't enough

v1 fixes where things sit; it does not fix how they leave. Entering search mode still plays three
independent motions in the same 300ms window:

| Motion | Driver | Curve |
|---|---|---|
| Header grows around the search field | UIKit | native |
| Tag bar room collapses (`tagBarHeightSV * tagBarVisibleSV`) | Reanimated | `withTiming(300, out-cubic)` |
| `NextMealCard` (~84pt) leaves | React unmount, or v1's `FadeOut` | one frame, or 250ms fade that **never animates height** |

The card is the worst of the three. `FadeOut` animates opacity only — the element keeps its full
84pt of layout until the exit animation completes, and then the space vanishes in a single frame.
So the list holds still, fades a hole in itself, and *then* snaps up. Unmounting outright (today's
code) does the same thing without the fade. Either way the rows below take a discrete 84pt step
while the tag bar is still mid-collapse. That step is the stutter.

Three secondary causes make it worse, all worth fixing in the same pass:

1. **A full list re-render is queued in the same frame the animation starts.** `handleSearchFocus`
   calls `setSelectedTagIds(new Set())` unconditionally (`index.tsx:405`). A fresh `Set` is a new
   reference even when nothing was selected, so the `filtered` `useMemo` (line 481) invalidates and
   every row re-renders on the first animation frame — on every single search tap, filters or not.
2. **The rows fight the collapse.** Each row carries `layout={LinearTransition.duration(250)}`
   (`index.tsx:681`). While the header's height animates, every row's `originY` changes each frame,
   so each row starts its own 250ms transition toward a target that has already moved. Rows arrive
   late and rubber-band behind the header.
3. **`showImportJobs` flips with the query/filters** (line 478), which can add or drop list items at
   the same moment.

## Design: one shared value, one curve, nothing unmounts

Replace `tagBarVisibleSV` with a single `searchProgress` shared value — `0` idle, `1` searching —
animated once per focus/blur. Everything above the results is a function of it. Nothing is removed
from the tree; the card and the chips stay mounted the whole time and are moved, faded and clipped
out of the way.

The chrome is split by *who owns its position*:

- The **tag bar** is an overlay (v1 §2), so it just slides up and fades. Because the stack is
  `headerTransparent: true`, the native nav bar draws above RN content — sliding the bar up tucks it
  under the real blurred header, which is exactly the native feel.
- The **card and the tag bar's reserved room** live in the list header, so they need a clipping
  window: the window's height shrinks while its content slides up inside it by the same amount. Both
  edges move together, so it reads as "sliding under the header" rather than a curtain being drawn.

### A. `index.tsx` — collapsing list header

```tsx
const NEXT_MEAL_CARD_HEIGHT = 84   // styles.nextMealCard minHeight 72 + marginBottom 12
const searchProgress = useSharedValue(0)
const headerChromeHeightSV = useSharedValue(TAG_BAR_HEIGHT + NEXT_MEAL_CARD_HEIGHT)

const headerChromeWindowStyle = useAnimatedStyle(() => ({
  height: headerChromeHeightSV.value * (1 - searchProgress.value),
}))
const headerChromeContentStyle = useAnimatedStyle(() => ({
  opacity: 1 - searchProgress.value,
  transform: [{ translateY: -headerChromeHeightSV.value * searchProgress.value }],
}))
const tagBarRoomStyle = useAnimatedStyle(() => ({ height: tagBarHeightSV.value }))
```

```tsx
ListHeaderComponent={
  <Reanimated.View style={[styles.headerChromeWindow, headerChromeWindowStyle]}>
    <Reanimated.View
      style={headerChromeContentStyle}
      onLayout={(e) => { headerChromeHeightSV.value = e.nativeEvent.layout.height }}
      pointerEvents={isSearching ? 'none' : 'auto'}
    >
      <Reanimated.View style={tagBarRoomStyle} />
      <NextMealCard enabled={dataQueriesEnabled} />
    </Reanimated.View>
  </Reanimated.View>
}
```

- `styles.headerChromeWindow` is `{ overflow: 'hidden' }`. This is the only new style.
- The inner view keeps its natural height while the window clips it, so `onLayout` reports the true
  chrome height (tag-bar room + whatever variant of the card is rendered) and the seed constant only
  ever governs the first frame. `NextMealCard` always renders something — skeleton, error, empty or
  entry — so the height is stable, but it does vary with Dynamic Type.
- The tag-bar room spacer no longer multiplies by visibility; the window owns all the collapsing.
- `{!isSearching && ...}` is gone. **Never unmount the card** — remounting on blur costs a frame and
  re-runs `useNextMealPlanEntry`'s render path for nothing.

### B. `index.tsx` — tag bar overlay tucks under the header

The v1 nesting stays; the inner Reanimated view gains a translate:

```tsx
const tagBarChromeStyle = useAnimatedStyle(() => ({
  opacity: 1 - searchProgress.value,
  transform: [{ translateY: -tagBarHeightSV.value * searchProgress.value }],
}))
```

Outer RN `Animated.View` still owns `translateY: animatedHeaderHeight` only — the two animation
systems stay in separate views (v1 constraint, unchanged).

### C. `index.tsx` — focus/blur handlers

```tsx
const handleSearchFocus = useCallback(() => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  searchProgress.value = withTiming(1, SEARCH_TRANSITION)
  setIsSearching(true)
  if (selectedTagIds.size > 0) setSelectedTagIds(new Set())
  if (filterFavourites) setFilterFavourites(false)
}, [filterFavourites, searchProgress, selectedTagIds])
```

- `SEARCH_TRANSITION = { duration: 300, easing: Easing.out(Easing.cubic) }`, shared by focus and
  blur so both directions match.
- The guards on the two filter resets are the fix for cause 1 — no new `Set` identity, no `filtered`
  invalidation, no full-list re-render on a plain search tap.
- Keep the existing ordering comment: the shared-value write must happen before any `setState`.
- `handleSearchBlur` is the mirror (`withTiming(0, SEARCH_TRANSITION)`, `setIsSearching(false)`).

### D. `index.tsx` — stop the rows from chasing the collapse

Only if rows visibly lag behind the header during the collapse (cause 2 — verify on device before
adding this; it is a real risk, not a certainty). Gate the row layout transition for the duration of
the transition rather than removing it, since it is what makes insert/remove of recipes look right:

```tsx
const [isSearchTransitioning, setIsSearchTransitioning] = useState(false)
const rowLayoutTransition = isSearchTransitioning ? undefined : LinearTransition.duration(250)
```

Set it `true` alongside the `withTiming` call and clear it from the timing's completion callback via
`runOnJS`, in both handlers. `renderRecipe` then uses `layout={rowLayoutTransition}` and must take it
as a dependency.

## What this deliberately does not do

- **No native cross-fade to a separate results surface.** That is what UIKit does in Mail and Notes
  (`UISearchController` swaps in a results controller), and it is the only way to make the list
  contents change with zero layout work. `react-native-screens` does not expose the results
  controller, so it cannot be done natively here — the collapse above is the closest honest
  approximation.
- **No animation of the scroll view's `contentInset`.** RN applies `contentInset` prop changes
  immediately and outside any animation block, so it cannot carry this transition.

## Fallback if A still stutters on a long list

Animating the window's height still relayouts the list header every frame. If that proves too
expensive with many mounted rows, switch to a zero-relayout variant: keep the chrome's reserved room
constant and scroll it away natively instead —
`listRef.current?.scrollToOffset({ offset: currentOffset + chromeHeight, animated: true })` on focus,
with the chrome still fading and sliding via `searchProgress`. UIKit owns the motion so nothing
relayouts, at the cost of a blank band at the top of the content if the user scrolls back up while
searching. Try A first; only reach for this if measurements say otherwise.

## Verification (in addition to v1's)

- **Enter search with no filters active** — the list must not re-render (verify with a render log or
  React DevTools profiler); chips and card slide up under the header as one motion while the rows
  rise to meet the header, with no discrete step at any point.
- **Enter search with tags selected and favourites on** — same, plus the row set changes; confirm it
  still reads as one motion.
- **Cancel search** — card and chips come back down; the card must not flash a skeleton (proof it was
  never unmounted).
- **Rapid toggle** — tap search, cancel, search again before each animation finishes. `searchProgress`
  must retarget cleanly with no snapping, and the chrome must never end up half-collapsed.
- **Long list** — with 100+ recipes, watch the rows during the collapse. If they trail behind the
  header, apply §D.
- **Dynamic Type** — raise the text size; the chrome window must still collapse to exactly zero (the
  `onLayout` measurement, not the seed constant, is what guarantees this).

---

# v3 — Meal Plan screen has the same class of bug

Independent of v1 and v2 — different screen, no shared code — but the same root pattern: layout
numbers guessed in JS instead of taken from the platform. Can be implemented before or after v2.

`apps/mobile/src/screens/MealPlanScreen/` guesses the same two numbers v1 removed from Recipes, and
guesses them against a safe-area value that is **wrong on the first render and corrected on the
second**. Reported symptoms: the *Today* button jumps, and the list's centre-on-today lands in the
wrong place and then visibly jumps up.

## Root causes

### 1. `insets.bottom` changes one render after mount

`expo-router`'s `NativeTabsView.ios.js:55` wraps the tab content in a **second, nested**
`SafeAreaProvider`. A nested provider with no `initialMetrics` seeds its state from the *parent*
provider (`react-native-safe-area-context@5.7.0`, `src/SafeAreaContext.tsx:42-44`:
`initialMetrics?.insets ?? initialSafeAreaInsets ?? parentInsets ?? null`) and only swaps in its own
measured insets when the native `onInsetsChange` arrives.

So inside any tab screen, the first render sees **window** insets (home indicator only) and the next
render sees **tab-scoped** insets (which include the native tab bar). Everything derived from
`insets.bottom` moves between those two renders. That single fact explains all three symptoms:

- `getTodayBtnStyle` → `bottom: insets.bottom + 16` (`index.tsx:220`) — the button jumps.
- `targetScrollOffset` depends on `insets.bottom` (`useCenterOnToday.ts:36`) → new value → new
  `recenterOnToday` identity → the effect at `useCenterOnToday.ts:50-52` re-fires → the list is
  scrolled a second time. **That is the visible jump up.**
- `contentContainerStyle` → `paddingBottom: insets.bottom + 16` (`index.tsx:248`) — content size
  changes under a scrolled list.

### 2. The tab bar is counted twice, the header is guessed

`useCenterOnToday.ts:14-15` hardcodes `HEADER_CONTENT_HEIGHT = 44` and
`TAB_BAR_CONTENT_HEIGHT = 49` with the comment *"neither is measurable from this screen's own view
tree"*. Both halves of that are wrong:

- The header **is** measurable: `useHeaderHeight()`. Unlike Recipes, this screen has no search bar
  and no large title, so the 100 ms debounce documented in v1 never engages and
  `getDefaultHeaderHeight` is exact from the first render.
- The tab bar is **already in** `insets.bottom` once the tab-scoped provider has reported, because
  UIKit puts the tab bar in a child view controller's safe area. So
  `windowHeight - insets.bottom - TAB_BAR_CONTENT_HEIGHT` subtracts it twice. Before the insets
  settle the formula is roughly right; after they settle it is ~49pt too high — the size and
  direction of the reported jump.

  *Verify before relying on it:* log `insets.bottom` on first and second render on the target iOS
  version. iOS 26's floating tab bar may not contribute to the safe area. If it does not, keep an
  explicit named constant — but keep it as the *only* guess, and drop it from the formula the moment
  the inset covers it.

### 3. The same double count applies to the content padding

This screen already uses `contentInsetAdjustmentBehavior="automatic"` (`index.tsx:249`), so UIKit
already insets the content by the safe area at both ends. `paddingBottom: insets.bottom + 16` adds
the tab bar a second time.

### 4. The fade-in uncovers the list too early

`listOpacity` exists precisely to hide the centering. But `setIsCentered(true)` fires inside
`recenterOnToday` (`useCenterOnToday.ts:44`) — on the *first* call, which is the pre-settle one. The
list fades in at the wrong offset and the correction happens in full view.

## Fixes

### M1. `useCenterOnToday.ts` — measure the strip instead of guessing it

```ts
const headerHeight = useHeaderHeight()   // expo-router/react-navigation

const targetScrollOffset = useMemo(() => {
  const todayOffset = offsets[todayIndex] ?? 0
  const visibleCenter = (headerHeight + (windowHeight - insets.bottom)) / 2
  return Math.max(0, todayOffset - visibleCenter + DAY_ROW_HEIGHT / 2)
}, [offsets, todayIndex, windowHeight, headerHeight, insets.bottom])
```

Delete `HEADER_CONTENT_HEIGHT`, `TAB_BAR_CONTENT_HEIGHT` and the block comment above them; the hook
takes `headerHeight` instead of `insets.top`. Keep the part of the comment that explains *why*
`scrollToOffset` is used instead of `scrollToIndex`'s `viewPosition` — that reasoning is still
correct and non-obvious.

### M2. `useCenterOnToday.ts` — fade in only once the applied offset is final

```ts
const appliedOffset = useRef<number | null>(null)

const recenterOnToday = useCallback((animated: boolean) => {
  if (hasUserScrolled.current) return
  listRef.current?.scrollToOffset({ offset: targetScrollOffset, animated })
  appliedOffset.current = targetScrollOffset
}, [targetScrollOffset])

const handleListLayout = useCallback(() => {
  recenterOnToday(false)
  if (appliedOffset.current === targetScrollOffset) setIsCentered(true)
}, [recenterOnToday, targetScrollOffset])
```

The list stays at `opacity: 0` across the inset settle, so the second scroll — the one the user sees
today — happens while nothing is on screen. Every correction stays `animated: false`; only the
explicit *Today* button and the `focusToday` param animate.

### M3. `index.tsx` — stop double-counting the bottom inset

`contentContainerStyle` becomes `paddingBottom: 16`. The tab bar and home indicator are already in
the scroll view's adjusted content inset via `"automatic"`.

### M4. `index.tsx` — the Today button must not jump either

It is chrome for the list, so gate it on the same signal: move the button inside the same
`Animated.View` that carries `listOpacity`, or give it its own `style={{ opacity: listOpacity }}`.
Two frames without a floating button is invisible; a button that jumps is not. Its
`bottom: insets.bottom + 16` is then correct as written, since the settled tab-scoped inset already
clears the tab bar.

## v1 follow-through on Recipes

Switching the recipe list to `contentInsetAdjustmentBehavior="automatic"` (v1 §1) puts it in exactly
the situation described in cause 3: `contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}`
(`RecipesScreen/index.tsx:840`) starts double-counting the tab bar the moment the native inset takes
over. Reduce it to the floating-add-button clearance alone (`paddingBottom: 88`) as part of v1, and
check the last row clears the FAB on a device with and without a home indicator.

## Verification (Meal Plan)

- **Cold load** — the list must appear already centred on today; no second scroll, no upward jump.
  Log `targetScrollOffset` each render: it may change once (insets settling), but only one
  `scrollToOffset` may be observable to the user, and the fade-in must come after it.
- **Today row position** — measure it: the row's centre should sit midway between the header's
  bottom edge and the tab bar's top edge, not ~49pt above it.
- **Today button** — it must be in its final position the moment it becomes visible.
- **Bottom of list** — scroll to the last day; it should clear the tab bar by ~16pt, not by ~99pt
  (proof M3 landed).
- **Return from another tab / `focusToday` deep link** — tapping the Recipes next-meal card still
  animates to today.
- **Rotation** — after rotating, the Today button and the centring both settle without a visible
  second move.
