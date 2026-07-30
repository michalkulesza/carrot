# Meal plan — stable initial centering without a layout jump

Open the mobile Meal Plan tab and show today already centered between the native stack header and
native tab bar. The list and floating **Today** button must never visibly correct their positions
after the screen appears.

Decisions already made (do not re-litigate):

- **Keep Expo Router Native Tabs.** Do not switch to JavaScript tabs to gain a measurable tab-bar
  height.
- **Do not calculate the native tab-bar height in JavaScript.** Expo documents that Native Tabs
  cannot currently report it because the bar can move to another edge on iPad and Vision Pro.
- **Opt this tab out of automatic content insets and let a native safe-area view define the usable
  frame.** This is Expo's documented full-control path for Native Tabs in SDK 55+.
- **Center against the FlatList's real laid-out viewport.** Once its frame excludes the header and
  tab bar, React Native's `scrollToIndex({ viewPosition: 0.5 })` has the correct coordinate space.
- **No timeout or guessed-metric fallback.** A fallback geometry can either jump when corrected or
  remain permanently wrong. Initial reveal waits for focus and a positive layout instead.
- **Preserve the transparent native header, drag-to-move interaction, Today deep link, rotation,
  and the existing 150 ms reveal.** This is a layout correction, not a visual redesign.

Official references:

- [Expo Native Tabs safe-area handling](https://docs.expo.dev/router/advanced/native-tabs/#safe-area-handling)
- [Expo Native Tabs known limitations](https://docs.expo.dev/router/advanced/native-tabs/#known-limitations)
- [React Native FlatList `initialScrollIndex` and `scrollToIndex`](https://reactnative.dev/docs/flatlist)
- [React Native layout measurement](https://reactnative.dev/docs/the-new-architecture/layout-measurements)

---

## 1. Current failure

`apps/mobile/src/screens/MealPlanScreen/useCenterOnToday.ts` currently gets the visible screen
geometry from two asynchronous sources:

1. `SafeAreaListener` should report the tab-scoped native frame and bottom inset.
2. If that callback has not arrived after `MEASUREMENT_FALLBACK_MS = 250`, the hook accepts the
   nearest safe-area context values instead.

When the fallback wins, the hook scrolls to the provisional offset, sets `isCentered`, and begins
revealing the list and Today button. A later `SafeAreaListener` event replaces `screen`, which:

- recalculates `targetScrollOffset` and runs a second non-animated scroll;
- changes the Today button's absolute `bottom` value;
- produces the reported visible jump.

The fallback was added because a `SafeAreaListener` inside an eagerly mounted native tab can miss
its useful first event while the inactive tab has a zero frame. Removing only the fallback would
therefore bring back the permanent blank-screen failure. Increasing the timeout only changes how
often the race reproduces.

`initialWindowMetrics` is not a solution here. Expo Router creates a nested provider for each
native tab; initializing an app-root provider does not give that nested provider its final
tab-scoped geometry.

---

## 2. Target layout ownership

### Native Tabs owns the outer safe area

`apps/mobile/app/(tabs)/_layout.tsx`

Add `disableAutomaticContentInsets` only to the `meal-plan` trigger:

```tsx
<NativeTabs.Trigger name="meal-plan" disableAutomaticContentInsets>
```

Keep every other tab unchanged. This option is static and must not be toggled at runtime.

### A native safe-area view owns the Meal Plan bottom boundary

`apps/mobile/src/screens/MealPlanScreen/index.tsx`

Import `SafeAreaView` from `react-native-screens/experimental`, not from React Native or
`react-native-safe-area-context`:

```tsx
import { SafeAreaView } from 'react-native-screens/experimental'
```

Wrap the Meal Plan screen's interactive content with:

```tsx
<SafeAreaView edges={{ bottom: true }} style={styles.safeArea}>
  <View style={[styles.visibleFrame, visibleFrameStyle]}>
    {/* list, drag overlays, and Today button */}
  </View>
</SafeAreaView>
```

`visibleFrameStyle` supplies `paddingTop: headerHeight`, where `headerHeight` continues to come
from `useHeaderHeight()` in `expo-router/react-navigation`. Keep that named style value outside
JSX per the project readability conventions.

This yields one native layout hierarchy:

```text
screen
└── native SafeAreaView (removes the tab bar / bottom safe area)
    └── visibleFrame (removes the transparent stack header at the top)
        ├── FlatList + drag overlays
        └── Today button, bottom: 16
```

The `visibleFrame` is the only coordinate space used for list centering, Today positioning, and
drag hit-testing. Do not retain a parallel `bottomInset` number in React state.

Set the FlatList's `contentInsetAdjustmentBehavior` to `"never"` (rather than merely removing the
prop) so future work cannot accidentally re-enable a second inset owner. Keep the static
`contentContainerStyle` bottom padding of 16 for last-row breathing room.

The Today button remains inside the opacity wrapper and becomes `bottom: 16`. Because its
containing frame already ends above the native bottom safe area, it needs no device-dependent
position calculation.

### Package availability

No dependency change is needed. Expo SDK 56 resolves `react-native-screens` 4.25.2 in the current
lockfile, which includes the experimental native `SafeAreaView` used by Expo's documented Native
Tabs pattern.

---

## 3. Centering lifecycle

`apps/mobile/src/screens/MealPlanScreen/useCenterOnToday.ts`

Replace safe-area measurement with a small focus-and-layout state machine.

Inputs:

- `todayIndex`
- `isFocused`

Owned state and refs:

- `viewportHeight: number | null`
- `hasUserScrolled`
- `hasInitiallyCentered`
- existing `listOpacity`
- existing animated FlatList ref required by drag-to-move

The hook no longer receives `offsets` or `headerHeight`. The outer layout has already removed both
pieces of native chrome before the FlatList is measured.

### Initial render window

Pass both of these to the FlatList:

```tsx
initialScrollIndex={todayIndex}
getItemLayout={getItemLayout}
```

`initialScrollIndex` ensures the initial virtualization window is built around today instead of
rendering the first 14 rows and replacing them after the imperative scroll. It is not sufficient
for visual centering on its own; React Native places the initial item at the start of the list.

Keep `getItemLayout` exactly aligned with `DAY_ROW_HEIGHT`, `MONTH_HEADER_HEIGHT`, and the existing
`offsets` array. Month headers make a simple `index * height` formula invalid.

Remove the `contentOffset` prop. There must be one initial-position mechanism, not a provisional
offset plus a later index scroll.

### Capture the actual viewport

The FlatList/gesture container's `onLayout` provides its height to the centering hook. Ignore
zero-height events from eagerly mounted inactive tabs. Update the stored height only when it has
actually changed so rotation does not cause redundant render loops.

Continue forwarding the same layout event to `useDragToMove.handleContainerLayout`; drag
auto-scroll still needs the viewport measurement.

### Center and reveal

Use `useIsFocused()` from Expo Router in `MealPlanScreen` and pass the result to the hook. Native
Tabs eagerly mount every tab, so both conditions are required before initial centering:

```text
isFocused && viewportHeight > 0
```

In `useLayoutEffect`, call:

```tsx
listRef.current?.scrollToIndex({
  index: todayIndex,
  viewPosition: 0.5,
  animated: false,
})
```

Then mark the initial centering complete and run the existing 150 ms native-driver opacity reveal.
React Native recommends `useLayoutEffect` when a measurement must be applied in the same frame.
Do not replace it with `useEffect`, `setTimeout`, `InteractionManager`, or a guessed frame count.

The raw FlatList frame now equals the visible region, so the old warning that `viewPosition: 0.5`
centers against the full window no longer applies. Delete that obsolete block comment together
with all safe-area fallback commentary.

### Later layout changes

When a positive viewport height changes because of rotation, split view, or header-height changes:

- if the user has not manually scrolled, recenter non-animated against the new list frame;
- if the user has manually scrolled, preserve their position;
- never reset opacity after the first reveal.

The first focus must center even if the tab emitted a positive off-screen layout earlier. A focus
change is therefore part of the layout effect's readiness condition.

### Today action and deep link

`handleScrollToToday` keeps the existing behavior:

- clear `hasUserScrolled`;
- if focused with a positive viewport, call `scrollToIndex` with `viewPosition: 0.5` and
  `animated: true`;
- if called before readiness, leave the request satisfied by the mandatory initial centering when
  readiness arrives.

Repeated rapid Today taps are safe because every call targets the same index and view position.
Do not enqueue multiple destinations or change screen state per tap; the command is idempotent and
the latest animation simply retargets the same destination.

The `focusToday` route parameter must continue to call this same handler. Do not add a second
centering path for deep links.

---

## 4. Drag-to-move compatibility

`apps/mobile/src/screens/MealPlanScreen/useDragToMove.ts`

The current drag math uses coordinates relative to the `GestureDetector` container:

```text
contentY = gestureY + scrollY
```

This remains correct only if the detector, FlatList, drop highlight, and drag preview share the new
`visibleFrame`. Keep those four elements together inside the header- and bottom-inset layout.

With automatic content insets removed, the list starts with a normal non-negative content offset.
Do not carry over compensations for the previous negative top content inset. Verify these paths
without changing the drag interaction design:

- holding a planned meal still lifts the correct day;
- the preview stays under the finger near the top and bottom edges;
- the hovered day matches the visible row;
- auto-scroll clamps at both ends of the content;
- rotating before a drag updates the viewport used by edge auto-scroll;
- tapping a row still opens its existing action flow.

No row measurement is added. The fixed-height `offsets` array remains the source of truth for
content-space hit-testing.

---

## 5. File-by-file changes

| File | Change |
|---|---|
| `apps/mobile/app/(tabs)/_layout.tsx` | Add `disableAutomaticContentInsets` to the static Meal Plan trigger only. |
| `apps/mobile/src/screens/MealPlanScreen/index.tsx` | Add `useIsFocused`, native `SafeAreaView`, header padding wrapper, `initialScrollIndex`; remove `SafeAreaListener`, `contentOffset`, dynamic Today bottom, and automatic FlatList insets. |
| `apps/mobile/src/screens/MealPlanScreen/useCenterOnToday.ts` | Replace screen/inset state and fallback timer with focus + positive viewport layout; center via `scrollToIndex` in `useLayoutEffect`. |
| `apps/mobile/src/screens/MealPlanScreen/styles.ts` | Remove `safeAreaProbe`; add stable safe-area/visible-frame styles; keep Today at a constant bottom offset. |
| `apps/mobile/src/screens/MealPlanScreen/useDragToMove.ts` | Change only if verification exposes an assumption about the old adjusted content offset; otherwise leave behavior untouched. |
| `docs/specs/meal-plan-stable-initial-centering.md` | Keep this plan with the implementation and move it to `docs/specs/completed/` only after all completion criteria pass. |

No locale changes are expected because this plan introduces no user-visible strings.

---

## 6. Tests and verification

### Static checks

Run the mobile project's existing formatter/linter and TypeScript check. Also search the Meal Plan
screen to prove the obsolete path is gone:

```text
MEASUREMENT_FALLBACK_MS              -> no matches
SafeAreaListener                     -> no MealPlanScreen match
useSafeAreaInsets / useSafeAreaFrame -> no useCenterOnToday match
contentOffset                        -> no MealPlanScreen index match
bottomInset                          -> no MealPlanScreen positioning match
```

### iOS device/simulator matrix

The first-entry cases are mandatory; a second visit can conceal the original bug.

1. **First switch after a cold launch** — launch into another tab, then enter Meal Plan for the
   first time. Today row and Today button appear once at their final positions.
2. **Meal Plan as the restored tab** — kill and reopen with Meal Plan selected. It reveals centered
   without a top-of-list frame or delayed correction.
3. **Slow JS / development build** — reproduce with the debug runtime or artificial JS load. No
   timeout exists, so delayed JavaScript cannot reveal provisional geometry.
4. **Today geometry** — the row center is halfway between the bottom of the native header and the
   top of the native tab bar.
5. **Today button geometry** — the button clears the native tab bar by 16 pt and never moves after
   becoming visible.
6. **Rapid Today taps** — repeated taps during the scroll finish centered and do not lock or queue
   conflicting movement.
7. **Manual-scroll preservation** — scroll away, rotate, and confirm the screen does not pull back
   to today.
8. **Rotation before interaction** — rotate before manually scrolling; today recenters once within
   the new visible frame without hiding again.
9. **Deep link / next-meal card** — enter with `focusToday`; the same animated Today path runs.
10. **Bottom of list** — the last day clears the tab bar with the intended 16 pt content padding,
    without a second tab-bar-sized gap.
11. **Drag-to-move** — verify source selection, preview alignment, hover target, edge auto-scroll,
    successful drop, cancellation, and a normal row tap.
12. **Dark and light appearance** — the native safe-area wrapper stays opaque through the initial
    reveal and introduces no white/black frame.

Run the core matrix on at least:

- an iPhone with a home indicator;
- an iPhone simulator/device without relying on cached tab state between attempts;
- Android, to confirm the explicit safe-area ownership does not double-apply the system navigation
  inset.

If iPad is supported by the current build, also verify portrait and landscape because avoiding a
tab-bar-height assumption is specifically meant to remain correct when native tabs change shape or
placement.

### Instrumentation during implementation

Temporary render/layout logging is acceptable to prove the sequence, but remove it before review.
The expected cold-entry sequence is:

```text
inactive/zero layouts ignored
-> tab focused
-> positive visibleFrame layout
-> non-animated scrollToIndex(0.5)
-> one opacity reveal
```

There must be no later geometry-driven scroll unless the positive viewport height genuinely changes.

---

## 7. Completion criteria

Implementation is complete only when:

- the first cold entry shows no Today button or list-position jump;
- no timeout, tab-bar-height constant, or delayed safe-area JS measurement remains;
- FlatList virtualization begins around today via `initialScrollIndex` and fixed `getItemLayout`;
- initial centering waits for focus plus a positive real viewport and runs from `useLayoutEffect`;
- Today, deep-link recentering, user-scroll preservation, rotation, and drag-to-move still work;
- iOS and Android safe areas are applied exactly once;
- static checks and the manual first-entry matrix pass;
- the user confirms the behavior is fully complete and correct before any commit;
- this file is included in that commit and moved to `docs/specs/completed/` only after the
  implementation is fully complete.
