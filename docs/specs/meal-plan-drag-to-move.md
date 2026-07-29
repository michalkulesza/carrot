# Meal plan — drag a dish to another day

Hold a day row in the meal plan, lift the dish out of it, drag it over another day, drop.
The dish moves. If the target day already has a dish, the two swap.

Decisions already made (do not re-litigate):

- **Mobile interaction: hold + drag with a custom overlay.** There is no RN-exposed native
  drag-and-drop on iOS; this is a hand-built Reanimated + gesture-handler interaction and was
  accepted as such. `react-native-draggable-flatlist` (already a dependency, currently unused)
  is *not* usable here — it reorders a homogeneous list, whereas here the day slots are fixed
  and only the entry payload moves, and it would break `getItemLayout` + the
  `useCenterOnToday` centering.
- **Occupied target day: swap.** Never destructive, never asks for confirmation.
- **Scope: mobile + web + API.** Web gets HTML5 drag-and-drop on the desktop calendar grid,
  plus a keyboard/touch-accessible "Move to…" fallback in the day action modal.

---

## 1. API — atomic move endpoint

`services/api/src/api/routes/meal_plan.py`, `services/api/src/api/models.py`

Doing this client-side as `PUT target` + `DELETE source` is wrong: it is non-atomic, emits two
SSE broadcasts, and a swap would transiently violate the unique constraint. Add one endpoint.

### Model

```python
class MealPlanMoveRequest(BaseModel):
    to: str

    @model_validator(mode="after")
    def validate_to(self) -> "MealPlanMoveRequest": ...
```

Keep `to` a string and run it through the route's existing `_parse_date` so the 400 message
matches every other date in this router.

### Route

```python
@router.post("/{date_str}/move", response_model=list[MealPlanEntryOut])
async def move_meal_plan_entry(date_str, body, user, session, household_id) -> list[MealPlanEntryOut]:
```

`POST` on a sub-path, so it does not collide with the existing `PUT`/`DELETE /{date_str}` or
with the `/stream`-before-`/{date_str}` ordering note.

Behaviour:

1. `from_date = _parse_date(date_str)`, `to_date = _parse_date(body.to)`.
2. `from_date == to_date` → **400** `"Source and target dates are the same"`.
3. Load source via `_entry_filter(household_id, from_date)` → missing → **404** `"Entry not found"`.
4. Load target via `_entry_filter(household_id, to_date)`.
5. Apply the move (see below), `commit`, `refresh` each affected entry.
6. Publish **one** broadcast: `{"type": "meal_plan_changed", "date": date_str, "to": body.to}`.
   The existing subscriber only invalidates, so the extra field is informational.
7. Return the affected entries — `[moved]` for an empty target, `[at_from, at_to]` for a swap.

### The move itself — swap payloads, never dates

`meal_plan_entries` has `UniqueConstraint("household_id", "date", name="uq_meal_plan_household")`
and it is **not deferrable**, so a swap cannot be done by exchanging the two rows' `date`
values in one transaction. Move the *payload* instead:

```python
def _apply_move(source: MealPlanEntry, target: MealPlanEntry | None, to_date: DateType) -> list[MealPlanEntry]:
    if target is None:
        source.date = to_date
        return [source]

    source.recipe_id, target.recipe_id = target.recipe_id, source.recipe_id
    source.recipe, target.recipe = target.recipe, source.recipe
    source.text, target.text = target.text, source.text
    return [source, target]
```

Empty target → the row's `date` moves (no conflict, nothing at `to_date`).
Occupied target → both rows keep their dates and exchange `recipe_id` / `recipe` / `text`.
Row `id`s therefore stay bound to their dates. That is fine: `id` is not user-meaningful and
both clients key on `date`.

Keep `_apply_move` a module-level pure function so it can be unit-tested without a DB —
that is how the rest of this router's tests are written.

### Tests — `services/api/tests/test_meal_plan.py`

Follow the existing mock/`SimpleNamespace` style, no DB:

- `_apply_move` with `target=None` reassigns `date` and returns one entry.
- `_apply_move` with an occupied target swaps `recipe_id`/`recipe`/`text` both ways, leaves both
  `date`s untouched, and returns both entries.
- `_apply_move` swapping a recipe entry with a text entry clears the stale field on each side
  (a recipe entry must not end up with both `recipe_id` and `text`).
- `MealPlanMoveRequest` rejects a malformed `to`.
- The route exists at `/meal-plan/{date_str}/move` and is `POST`.

---

## 2. Shared client — API method + move mutation

### `packages/shared/src/api/client.ts`

Next to `setMealPlanEntry` / `deleteMealPlanEntry`:

```ts
const moveMealPlanEntry = async (from: string, to: string): Promise<MealPlanEntry[]> => { ... }
```

`POST /api/meal-plan/${from}/move`, body `{ to }`. Export it from the returned client object.

### `packages/shared/src/hooks/useMoveMealPlanEntry.ts` (new)

One shared mutation used by both apps. `mutationFn: ({ from, to }) => api.moveMealPlanEntry(from, to)`.

**Optimistic update is required** — without it the row visibly snaps back to the source day for
the duration of the round trip, which reads as a failed drag.

- `onMutate`: `await qc.cancelQueries({ queryKey: ['mealPlan'] })`, snapshot the affected month
  caches, then apply the swap locally. A move can cross a month boundary, so derive the month
  key from each date (`from.slice(0, 7)`, `to.slice(0, 7)`) and touch **both** caches — they may
  be the same key or two different ones.
  Local rule, mirroring the server: target empty → the source entry's `date` becomes `to`;
  target occupied → exchange `recipe`/`text` between the two entries.
- `onError`: restore the snapshots and surface the failure (mobile: `Alert.alert` with
  `mealPlan.moveFailed`; web: existing error surface in `MealPlanPage`).
- `onSettled`: `qc.invalidateQueries({ queryKey: ['mealPlan'] })`. This also covers
  `['mealPlan', 'next', todayIso]`, whose value can change when the earliest upcoming dish moves
  — do not hand-patch that key here, just let the invalidate refetch it.

### `packages/shared/src/hooks/useMealPlan.ts`

Return `moveEntry` from `useMoveMealPlanEntry()` alongside `setEntry` / `deleteEntry` so the web
page picks it up without a second import.

---

## 3. Mobile — hold and drag

`apps/mobile/src/screens/MealPlanScreen/`

The screen is a `FlatList` of `{ type: 'month' } | { type: 'day' }` items with fixed heights
(`DAY_ROW_HEIGHT = 72`, `MONTH_HEADER_HEIGHT = 36`) and a precomputed `offsets` array giving
each item's content-space Y. That array is what makes hit-testing cheap: no per-row measurement,
no `onLayout` bookkeeping.

`index.tsx` is already 294 lines. Split the new work out rather than growing it:

| File | Contents |
|---|---|
| `useDragToMove.ts` (new) | gesture, shared values, hit-testing, auto-scroll, drop handler |
| `DragPreviewCard.tsx` (new) | the lifted card that follows the finger |
| `DropTargetHighlight.tsx` (new) | the highlight rectangle over the hovered day |
| `helpers.ts` | `findDayIndexAtContentY` + `contentHeight` from `buildListItems` |
| `styles.ts` | styles for the two new components |
| `index.tsx` | wire the hook, render the two overlays |
| `useCenterOnToday.ts` | `listRef` becomes a `useAnimatedRef` |

### Coordinate math

Use the pan gesture's `y` (relative to the `GestureDetector`'s view), **not** `absoluteY` — then
no absolute measurement of the list is needed. With `scrollY` mirroring the list's
`contentOffset.y`:

```
contentY = y + scrollY
```

This is already inset-correct: `contentInsetAdjustmentBehavior="automatic"` makes
`contentOffset.y` negative while the content sits below the transparent header, and the formula
absorbs that.

`findDayIndexAtContentY(offsets, items, contentY)` — binary search `offsets` (sorted, stable via
`useMemo`) for the item containing `contentY`; return `-1` when the hit lands on a `month`
header or outside the range. Mark it `'worklet'` so the gesture can call it on the UI thread.

### Shared values and the scroll handler

Everything that runs per frame must stay on the UI thread. Convert the list to Reanimated's
`Animated.FlatList` with `useAnimatedScrollHandler` writing `scrollY`; the RN `Animated.View`
opacity wrapper from `useCenterOnToday` stays as it is (different animation system, different
node — they do not conflict).

Shared values: `scrollY`, `dragY` (finger Y in view space), `dragTranslate` (card offset),
`hoveredIndex`, `isDragging`.

`useCenterOnToday`'s `listRef` becomes `useAnimatedRef<Animated.FlatList<ListItem>>` so the
auto-scroll can call Reanimated's `scrollTo` from a worklet. `scrollToOffset` keeps working on
an animated ref — the existing centering code is unchanged apart from the ref's type.

### The gesture

One `GestureDetector` wrapping the list container, not one per row. The row being dragged is
derived from the initial touch position, and a single detector keeps the drag continuous when
the finger crosses row boundaries.

```
Gesture.Pan()
  .activateAfterLongPress(300)
  .blocksExternalGesture(listRef)
```

- `activateAfterLongPress(300)` — the list scrolls normally until the hold completes, so this
  does not interfere with flinging through months.
- `blocksExternalGesture(listRef)` — once the drag is live the list stops scrolling under it.
- `onBegin`: record the touch Y. `onStart`: resolve the source index from `contentY`; if it is a
  month header or a day with **no** entry, fail the gesture (`isDragging` stays false, nothing
  lifts). Otherwise set `isDragging`, `runOnJS` a `Haptics.impactAsync(Light)` and set the
  `draggingIsoDate` state.
- `onUpdate`: update `dragTranslate` and `dragY`; recompute `hoveredIndex`. When it changes to a
  new valid day, `runOnJS(Haptics.selectionAsync)`.
- `onEnd`: read the hovered day. Same day / month header / no valid target → animate the card
  back to the source row and stop. Valid target → `runOnJS` the drop handler.
- `onFinalize`: clear `isDragging`, `hoveredIndex`, and `draggingIsoDate` in every path,
  including cancellation, so a cancelled gesture can never leave a row ghosted.

**Verify during implementation** (these are the parts most likely to need a tweak):

1. `Animated.FlatList` still honours `getItemLayout`, the initial `contentOffset` prop, and
   `contentInsetAdjustmentBehavior` — the centre-on-today behaviour must be unchanged.
2. A quick tap on a row still fires the `Pressable`'s `onPress` (the existing action alert /
   picker) with the pan detector above it.
3. `scrollTo(listRef, 0, y, false)` works against the animated FlatList ref.

### Auto-scroll at the edges

The target day is frequently off-screen. Inside a `useFrameCallback` that runs only while
`isDragging`: if `dragY` is within `80` of the top or bottom of the visible strip, step
`scrollY` by a speed ramped from the distance into that band (cap ~12 px/frame) and apply it
with Reanimated's `scrollTo`. Clamp to `[0, contentHeight - visibleHeight]`; have
`buildListItems` also return `contentHeight` (`offsets.at(-1) + height of the last item`) so the
clamp needs no new measurement. The hovered target keeps updating while auto-scrolling, since it
is derived from `dragY + scrollY`.

### The two overlays

**`DragPreviewCard`** — absolutely positioned, `pointerEvents="none"`, above the list. Shows the
dish exactly as the row does (title + thumbnail, `NetworkImage` with the same
`proxyThumbnailUrl`). Lift treatment: scale ~1.03, the iOS card shadow already used elsewhere
(`shadowOpacity` ~0.15, `shadowRadius` 8, `shadowOffset` `{0, 2}`), corner radius 12,
`secondarySystemBackground`. `useAnimatedStyle` from `dragTranslate` — never React state.

**`DropTargetHighlight`** — one absolutely positioned rectangle rather than per-row animated
styles: with ~15 rows mounted, one animated node beats fifteen. `useAnimatedStyle` sets
`translateY = offsets[hoveredIndex] - scrollY`, height `DAY_ROW_HEIGHT`, opacity 0 when
`hoveredIndex < 0`. Translucent `systemBlue` tint with a 2pt border so the underlying day number
stays readable. Reading `offsets` inside the worklet is fine — the array is stable.

**Source row while dragging** — pass `draggingIsoDate` into `renderItem` and have the source
`DayRow` render its empty state, so the dish visibly leaves a hole. This costs one render pass
at drag start and one at drag end (not per frame), which is acceptable. `DayRow`'s custom `memo`
comparator is hand-written and **must** gain the new prop, or the ghosting will not appear.

### Drop handler

`moveEntry.mutate({ from, to })`, then `Haptics.notificationAsync(Success)`. The optimistic
cache update lands before the card's return animation finishes, so the dish appears on the new
day immediately. On error the mutation rolls back and alerts with `mealPlan.moveFailed`.

### Accessibility

Drag is unusable with VoiceOver, so the same capability must exist without it. Add
**"Move to another day"** to the existing long-press `Alert.alert` on an occupied row
(`handleDayPress` in `index.tsx`) — it opens a native date picker sheet, and confirming calls the
same `moveEntry` mutation. Also give `DayRow` an `accessibilityHint` describing the hold gesture
when it has an entry.

---

## 4. Web — drag and drop on the desktop calendar

`apps/web/src/pages/MealPlanPage/`

HTML5 drag-and-drop is pointer-only; it does nothing on touch. So:

- **`DesktopCalendar` + `CalendarDayCell`** (the `hidden md:block` grid) get real drag-and-drop.
- **The `md:hidden` `DayRow` list** is the touch layout — leave its tap flow alone and cover
  moving through the modal fallback below.

### `CalendarDayCell`

New props: `isDragging`, `isDropTarget`, and drag callbacks. On the entry chip (only when
`entry` exists): `draggable`, `onDragStart` → `dataTransfer.setData('text/plain', cell.dateStr)`
plus `dataTransfer.effectAllowed = 'move'`, `onDragEnd` → clear. On the cell itself:
`onDragOver` → `preventDefault()` (required, or no drop fires) + report hover, `onDragLeave` →
clear, `onDrop` → `preventDefault()` + report the drop.

Visuals with existing Tailwind tokens: source chip `opacity-40` while dragging, drop-target cell
`ring-2 ring-primary bg-primary/5`. Cells outside the current month (`!isCurrentMonth`) are not
valid targets — they belong to an adjacent month that is not loaded in this cache page.

Note `CalendarDayCell`'s root is a `<button>`. A `draggable` child inside a button is fine, but
keep `draggable` on the chip, not on the button root, or the click-to-assign flow gets flaky.

### `DesktopCalendar` / `MealPlanPage`

`DesktopCalendar` owns `dragSourceDate` and `dragOverDate` (pure UI state, no reason to lift
them) and takes a new `onMoveEntry: (from: string, to: string) => void` prop. `MealPlanPage`
passes a handler calling `moveEntry.mutate`. Ignore a drop on the source date.

### Accessible / touch fallback — `DayActionModal`

Add a **"Move to…"** action next to View / Change / Remove. It reveals a native `<input
type="date">` (or the HeroUI date input already used in the project, if there is one) defaulting
to the entry's current date; confirming calls `moveEntry.mutate` and closes the modal. This is
the keyboard path *and* the touch-web path, so it is not optional.

---

## 5. Translations

`packages/shared/src/locales/{en,pl,de,fr,es}.json` — all five, under `mealPlan`:

| Key | English |
|---|---|
| `moveToDay` | Move to another day |
| `moveTo` | Move to… |
| `moveFailed` | Couldn't move the dish. Please try again. |
| `dragHint` | Double tap and hold, then drag to move this dish to another day. |

No hardcoded strings in either app.

---

## 6. Order of work

1. API endpoint + `_apply_move` + tests (`uv run --directory services/api pytest tests/test_meal_plan.py`).
2. `client.ts` method + `useMoveMealPlanEntry` + `useMealPlan` wiring.
3. Translations in all five locales.
4. Web: `CalendarDayCell` → `DesktopCalendar` → `MealPlanPage` → `DayActionModal` fallback.
   Check with `pnpm --filter web build` (runs `tsc -b`) and `pnpm --filter web lint`.
5. Mobile: `helpers.ts` additions → `useCenterOnToday` animated ref → `useDragToMove` →
   the two overlay components → `index.tsx` + `DayRow` wiring → Alert fallback.
6. Typecheck mobile (`pnpm --filter mobile exec tsc --noEmit`) and run on device — the drag
   cannot be validated any other way.

## 7. Manual test checklist (device)

- Hold a day with a dish → haptic, card lifts, source row shows its empty state.
- Drop on an empty day → dish moves, one haptic, no flicker back to the source.
- Drop on an occupied day → the two dishes swap.
- Drop on the same day → no request, card animates home.
- Drop on a month header → no request, card animates home.
- Hold on an empty day → nothing lifts, the list still scrolls.
- Drag to the top/bottom edge → auto-scrolls, highlight tracks the day under the finger.
- Drag across a month boundary (e.g. Jul 31 → Aug 1) → both month caches update, no stale row.
- Quick tap still opens the action alert / recipe picker.
- Backgrounding or a call mid-drag cancels cleanly — no row left ghosted.
- With the API stopped: the move rolls back and the failure alert appears.
- Text-only ("Frozen pizza") entries drag and swap the same as recipe entries.
- Desktop web: drag a chip between cells, including onto an occupied cell.
- Web keyboard-only: "Move to…" in the day action modal moves the dish.
