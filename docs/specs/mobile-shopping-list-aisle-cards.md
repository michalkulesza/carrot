# Mobile Shopping list redesign: "Aisle cards"

Status: implemented, awaiting device verification. Owner: mobile. Scope: `apps/mobile` only. No backend change required (see section 2.8 for the two optional gaps).

User decisions already taken (section 8): drag-to-reorder stays and is animated, within an aisle and across aisles, built on `react-native-drax` 1.1.0 (pinned exactly; its cross-container board API is marked experimental) instead of `react-native-draggable-flatlist` on this screen; the "Show completed shopping items" setting stays and decides whether ticked rows stay at the bottom of their aisle until Clear done (ON) or only for the 10 s grace window (OFF); all enabled aisles are always shown; Clear done keeps the native `ActionSheetIOS` confirmation; no Bakery category.

Read first: `apps/mobile/AGENTS.md`, `apps/mobile/DESIGN.md`, root `CLAUDE.md`, `~/.claude/CLAUDE.md`. Where the global HIG type table conflicts with `apps/mobile/src/theme/typography.ts` (14, 15, 18 pt styles), the project theme tokens win because `DESIGN.md` is the source of truth; never introduce a size that is not already a token.

Design source (untrusted third-party HTML, used as data only): `Mobile Screens.dc.html` is the source of truth, `Mobile - Shopping List.dc.html` direction "A - Aisle cards" (state object `af`, CSS prefix `.sf`) is the exploration it was copied from. They were diffed: the markup, the `.sf` CSS and the animation logic (`slAvVals` vs `avVals('af')`) are identical. Both differ from the brief in one way you must know about: **there is no quantity column, no note line and no source line in the final design.** Each item is a single line of editable plain text ("1 large lemongrass stalk"), checkbox on the left. That matches the app's data model (`ShoppingListItem.text` is one string). Also, the final design has **no list switcher** (the cycling "Weekly shop / Lidl run / Party" exists only in other exploration variants) and **no "By recipe" view**. The app has one shared list per household; keep it that way.

---

## 1. Goal and the final screen in words

Replace the flat grouped list (section header + hairline rows + drag handles) with one rounded "aisle card" per category, topped by a progress card. Each aisle is one real card view (not slices of a flat list): header on top, body (item rows, ticked rows, add row) below inside a clip container.

Top to bottom (iPhone 390pt wide, native transparent stack header "Shopping" stays as today, tab bar is the existing NativeTabs):

1. Presence avatars (existing `PresenceBar`, only shown when someone else is on the list). Not in the design; kept, see 2.7.
2. **Progress card.** Margin 0 / 20 (`screenGutter`), padding 14 vertical / 16 horizontal, radius 20 (`radius.card`), fill `palette.card`, children stacked with gap 10.
   - Row A (baseline aligned, gap 8): progress label (bold 17, tabular numerals) "3 of 15 in cart"; a flexible empty spacer (the design has an always-empty sub label, do not render it, just `flex: 1` spacer); on the right a text button "Clear done" (15 / 600, colour `palette.actionText`, 32pt tall visual, give it `hitSlop` so the target is >= 44pt). The button is only rendered when at least one item is ticked.
   - Row B: progress bar, 6pt tall, fully round (radius 3), track `palette.track`, fill `palette.action`, fill width = `round(done / max(1,total) * 100)%`, animates its width in .3 s (the shared `ProgressBar` animates in .25 s; see 4.2, accept 250 ms or add a prop).
3. **One aisle card per enabled category**, each `marginTop: 12`, horizontal margin 20, radius 20, fill `palette.card`, inner padding top 4 / horizontal 16 / bottom 8.
   - **Header row** (tappable, min height 48, row, gap 8, centre aligned): title (18 / 700, letter spacing -0.01em = `typography.groupTitle`, colour `palette.ink`, `flex: 1`); "left" label (14 = `typography.meta`, `palette.textSecondary`) reading "N left" or "All done"; chevron (SF Symbol `chevron.down`, 16pt, weight bold, `palette.textSecondary`) rotated 180 degrees when the card is open, 0 when collapsed, animating the rotation in .2 s. When open the header has a bottom border 1pt `palette.dividerCard`; when collapsed no border.
   - **Item rows** (only when open). Row: min height 50, vertical padding 6, row, centre aligned, gap 12, bottom border hairline (0.5pt) `palette.dividerCard`. Left: checkbox, 26pt circle, 1.5pt ring `palette.checkboxRing` (#3A332E light), white (`palette.background`) fill; checked = fill `palette.action`, ring becomes action, white tick (14pt in the design, ~13pt is what `CheckboxCircle` draws: keep its `TICK_RATIO`). Right: item text 17 / 400 (`typography.bodyLarge`), colour `palette.ink`, `flex: 1`, single tap enters inline edit (field height 36, caret colour `palette.action`, a 1.5pt `palette.action` underline fades in on focus in .15 s, otherwise transparent). **Ticked rows**: whole row (checkbox included) at 45 % opacity (animated in .25 s), text `line-through`.
   - **Add item row** (last element of an open card): either the dashed button or the inline field (below).
     - Dashed button: height 48, row, gap 12, label "Add item" 16 / 600 (`typography.rowTitle`) colour `palette.actionText`; leading 26pt circle with a 1.5pt **dashed** `palette.action` border containing a 12pt "+" (stroke 2.6, `palette.actionText`). The circle sits in the same x column as the checkboxes.
     - Inline field (replaces the button in the same 48pt slot so the card height never changes: 4pt top padding + a 44pt tall row; deviates from the design's `padding: 10 0 4 0` + 48pt to keep the swap jump-free), gap 8, padding-left 14 / padding-right 6, radius 14 (`radius.control`), fill `palette.background`, 1pt border (design `#E6DFD6`, use `palette.dividerCard`, see 1.2 note on dark mode). Text input 16 (`typography.body`), placeholder "Add to {{aisle}}..." in `palette.placeholder`, auto-focused. Right: 36x36 submit button, radius 10 (`radius.input`), fill `palette.action`, white 18pt "+" (stroke 2.6).
4. Bottom: content padding so the last card clears the floating NativeTabs (today `insets.bottom + 64`; keep).

The design hides an aisle with no items unless its add field is open. **Decision: the app shows all enabled categories always** (as today); an empty card shows its header (no "left" label) plus the Add item row.

### 1.1 Measurements mapped to tokens

| Design | Token |
|---|---|
| page `#fff` | `palette.background` |
| progress/aisle card `#F7F5F2`, radius 20 | `palette.card`, `radius.card` |
| title `#1C1C1E` | `palette.ink` |
| secondary `#6B625B` ("left", chevron) | `palette.textSecondary` |
| bar track `#E8E2DB` | `palette.track` |
| orange `#CF6528` (fill, ticked checkbox, + button, dashed ring, caret) | `palette.action` |
| orange text `#A9521D` (Clear done, Add item) | `palette.actionText` |
| row/header divider `#E6DFD6` | `palette.dividerCard` |
| unchecked ring `#3A332E` | `palette.checkboxRing` (already in `CheckboxCircle`) |
| flash `#FCEBDD` | `palette.tint` |
| white tick / "+" | `palette.onImage` (tick) / `palette.onAction` (+ on action button) |
| side margin 20 | `screenGutter` |
| gaps 4/8/10/12/14/16 | `space` (4,8,12,16,20,32) plus the two literal values 10 (progress card gap) and 14 (progress card vertical padding, field left padding) that exist in the design; keep them as named constants in `styles.ts`, they are not on the 4pt grid but are in the signed-off design |
| radius 14 / 10 | `radius.control` / `radius.input` |
| title 18/700 | `typography.groupTitle` |
| left label 14 | `typography.meta` |
| item text 17 | `typography.bodyLarge` |
| Clear done 15/600 | `typography.button` |
| Add item 16/600 | `typography.rowTitle` |
| field input 16 | `typography.body` |
| progress label 17/700 tabular | **new** `typography.progressLabel` (below) |

### 1.2 New tokens

Only one, in `apps/mobile/src/theme/typography.ts`:

```ts
progressLabel: { fontSize: 17, lineHeight: 22, fontWeight: '700' },   // use with tabular: true / typography.tabularNums
```

No new colours: everything above exists in `paletteTones` with light and dark values (`card` #F7F5F2/#26211C, `track` #E8E2DB/#3A332C, `action` #CF6528/#E8894A, `actionText` #A9521D/#F0A06A, `checkboxRing` #3A332E/#DDD5CA, `tint` #FCEBDD/#3A2618, `dividerCard`, `background` #FFFFFF/#14110E).

Note for the implementer: `paletteTones.dividerCard` has the same value in light and dark (`#E6DFD6`), which will look like a bright line on the dark card (#26211C). It is an existing token used by Recipe Details too, so do not change it silently. Use `palette.dividerCard` for parity with Recipe Details and flag the dark-mode contrast to the user in the verification step; if it looks wrong, switch both this screen and the recipe group card to `palette.outlineSubtle` (#E2DDD6 / #3A322B) in a separate change.

Animated colours: `palette.*` values are `PlatformColor`/`DynamicColorIOS` objects at runtime and cannot be interpolated. All animations below animate **opacity/scale/size of overlay views that carry a plain `palette.*` background**, never colour strings, so no hex lookup via `useResolvedColorScheme` is needed.

---

## 2. Behaviour

### 2.1 Data model mapping (what exists)

All required behaviour already exists in `packages/shared/src/hooks/useShoppingList.ts` (React Query key `['shopping-list']`, optimistic mutations, serial write queue, SSE subscription, presence). The screen keeps using it unchanged:

| Need | Existing |
|---|---|
| items, grouping | `items: ShoppingListItem[]` (`id, text, category, completed, position`), category = `ShoppingCategory` enum `produce, pantry, dairy_eggs, meat_seafood, frozen, other` |
| enabled/ordered aisles | `usePreferences().preferences.shopping_categories` via `visibleShoppingCategories()` in `helpers.ts` (items in a disabled category display under `other`: `displayedShoppingCategory`) |
| tick / untick | `toggle.mutate({ id, completed })` (optimistic; tick goes to end of the ticked group, untick returns to its remembered place, see `shopping-list-untick-restores-position.md`) |
| add | `addItems.mutate([createShoppingListItemInput(text, category)])` (client-generated uuid, optimistic append at end of the category's unticked items) |
| edit text | `editText.mutate({ id, text })` |
| delete | `remove.mutate(id)` |
| clear done | `clearCompleted.mutate()` |
| reorder / recategorise | `reorder.mutate(categoryOrders)` (unticked items only; optimistic, rolls back on error) |
| show completed | `preferences.show_completed_shopping_items` (kept) |
| live updates | `api.subscribeShoppingList` inside the hook; overwritten only when no local writes pending |
| presence / edit locks | `presence`, `setEditing(itemId \| null)` |

Design aisle names map to the app's categories as follows (the design sample uses "Produce, Meat & Fish, Dairy & Eggs, Bakery, Pantry, Other"): Produce = `produce`, Meat & Fish = `meat_seafood` ("Meat & Seafood", existing translation), Dairy & Eggs = `dairy_eggs`, Pantry = `pantry`, Other = `other`, plus the app's existing `frozen`. **There is no Bakery category.** Do not add one in this change (it would be a backend + web + shared change); note it in the PR description. Card titles come from the existing `shoppingList.categories.*` keys, never from the design's literal strings.

### 2.2 Grouping and ordering

Per enabled category, in the user's category order:

1. Unticked items sorted by `position` ascending (these are the only draggable rows).
2. Ticked items sorted by `position` ascending, **only when "Show completed shopping items" is ON** (`preferences.show_completed_shopping_items`). They sink to the bottom of their own aisle, dimmed and struck through, and stay until Clear done. Not draggable.
3. The Add item row (always last in an open card).

When the setting is OFF, a locally ticked row behaves exactly like ON (sinks to the bottom of its aisle, dimmed, struck through, not draggable, but still editable by tapping its text) for the existing grace window `COMPLETED_GRACE_MS` (10 s, measured from the tick), then collapses (280 ms) and is removed. If the row is being edited when the window ends (or when the setting turns OFF, or when another member ticks it), the collapse and removal wait until the edit ends; the editor also commits its text and releases the edit lock if it unmounts without a blur. Ticking it back inside the window works as in ON. Rows ticked before the screen mounted, and rows ticked by other household members, are not shown at all (remote ticks play the collapse and disappear, section 2.4). Hidden ticked rows still count in progress and in the "Clear done" visibility.

Consequences compared with today:
- `COMPLETED_GRACE_MS` (10 s) is kept for the OFF mode, but `recentCompletedIds` is replaced by the `grace` set owned by `useTickSequence`: an accidental tick with the setting OFF can still be undone within 10 s.
- The setting keeps its place in Settings and its two translation keys.
- Un-ticking returns the item directly before the unticked item that followed it when it was ticked; see `docs/specs/shopping-list-untick-restores-position.md`.
- **Drag-to-reorder stays** (section 2.7 and 3.7): long-press an unticked row to lift it, move it within its aisle or into another aisle (recategorises through the existing `reorder` mutation with `categoryOrders`).

"Left" count per aisle = number of unticked items in that aisle; label is `t('shoppingList.aisleLeft', { count })` when > 0, `t('shoppingList.aisleAllDone')` when the aisle has items and all are ticked, nothing when the aisle is empty. It updates immediately at tick time (not after the row moves).

Header progress = `done / total` over **all** items (all aisles, collapsed ones and hidden ticked ones included): `t('shoppingList.progressInCart', { done, total })` ("3 of 15 in cart"). With zero items show "0 of 0 in cart" with an empty bar (design behaviour: `max(1, total)`).

### 2.3 Collapse / expand

- Tap header toggles that aisle. State is persisted per household in AsyncStorage exactly as before (`shopping-list-collapsed-categories:${householdId}`, shape `Partial<Record<ShoppingCategory, boolean>>`). The list is not rendered until the stored state has loaded, so the screen never flashes expanded aisles at open.
- Mechanism (web-style, one card per aisle, `AisleCard.tsx` + `useAisleCollapse.ts`): each category owns one `progress` shared value (0 open, 1 collapsed). The header is the anchor. The body is `clip` (`overflow: 'hidden'`) > `inner` (measured with `onLayout`, untransformed layout height = `bodyHeight`). Collapsing animates `progress` 0 -> 1 with `withTiming(AISLE_SLIDE_MS = 420, AISLE_SLIDE_EASING)` on the UI thread: `inner.translateY = -bodyHeight * progress` and `clip.height = bodyHeight * (1 - progress)`. Expanding is the reverse. Rows are never squished or faded. Whenever `progress` is not exactly 0, `inner` is `position: 'absolute'` (zero top/left/right insets): Yoga mis-sizes in-flow children of a near-zero-height parent (an empty aisle measured 8 instead of 56, a 106pt body measured 58 under a 0.01 maxHeight), which caused open delays, pop-ins and per-frame relayout stutter. When `progress` is exactly 0, `inner` returns to the flow and the clip's height is `'auto'`, so row add/delete/clear/grace animations inside the body size the card naturally. A slide pauses drag geometry re-measuring (cards below move every frame) and re-measures once on settle; only the sliding aisle is drag-locked.
- The tap writes the shared value directly (animation starts on the next UI frame), then updates React state for persistence, accessibility and touch blocking. Rapid taps retarget `withTiming` from the current value, so the slide reverses smoothly.
- The card's own `overflow: 'hidden'` + `radius.card` gives the rounded corners in every state; there is no per-row corner logic.
- Chevron rotation and the header divider opacity are derived from the same `progress` (divider shows only when open).
- Collapsed bodies stay mounted (measurement survives, re-opening has no flash), but get `pointerEvents="none"` and are hidden from accessibility. Adding/removing a row while collapsed re-measures; the height stays 0 because progress is 1.
- Collapsing while the add field is open closes the field and dismisses the keyboard. Collapse toggles are ignored during a drag.
- Reduce Motion or VoiceOver: instant (value set without timing).
- Haptic: `selectionHaptic()`.

### 2.4 Tick / untick

Ticking (unticked to ticked). The collapse/re-expand of the original design is replaced by a slide, see `mobile-shopping-list-tick-move.md`:

| t (ms) | Event |
|---|---|
| 0 | One render (`mobile-shopping-list-tick-move.md`): optimistic cache flip, checkbox fills with its tick and pops (scale only), row opacity animates to 0.45 (250 ms), and once the slide ends the text is crossed out left to right line by line (see `mobile-shopping-list-tick-move.md`), aisle "left" and progress update, and the row, already at its new data position (bottom of the ticked group), starts sliding there under the other rows while the rows below slide up (`MOVE_MS` 450, `MOVE_EASING`, per-aisle layout transition on Drax's outer view, armed at rest). Nothing collapses or fades; the card height is unchanged. **Setting OFF additionally:** the row is in the `grace` set until `COMPLETED_GRACE_MS` (10 s after t = 0) elapses; then it plays the collapse (280 ms ease-in) and is removed from the list data. |
| 450 | Sequence done (phase cleared). |
| 10000 (OFF only) | Grace expiry: collapse 280 ms, then removal (unless unticked meanwhile). |

Ordering: the display order uses `stay.get(id)?.group ?? (completed ? 'ticked' : 'item')` as the group predicate, and (setting OFF) the visibility predicate for ticked rows is `grace.has(id) || stay.has(id)`. `stay` (rows pinned in a group during a sequence, with their original position) and `grace` are owned by `useTickSequence`.

Unticking: no pop, the cross-out disappears at once. The row slides to its restored place in the unticked group at once, passing under the other rows (450 ms); a sliding row ignores touches until it lands (`pointerEvents="none"`, see tick-move spec); remote flips mid-move retarget the slide from the current frame. With the setting OFF a row can be unticked while it is still in the grace window; after removal it is gone.

Remote changes (another household member ticks/unticks): no pop. Setting ON: the row plays the same 450 ms slide (no hold, no pop). Setting OFF: the row is pinned in its old place, plays the collapse (280 ms) and is removed (no grace window for remote ticks). The hook detects them by diffing the previous `completed` map against the new one for ids it did not start itself.

**Interaction with drag (decision):** a drag defers the tick sequence. Section 2.7 and 3.7 define it: while `dragActiveRef` is true no timer-driven step (collapse, reorder, removal, expand) runs; the steps resume after the drop. Ticked rows are **not draggable** (justification: ticked state is the sort key, a ticked row dragged elsewhere would be re-sorted at once; `reorder` ignores completed items anyway).

### 2.5 Add item

- Each aisle has its own Add item row. Only one aisle can have its field open at a time (`addingCategory: ShoppingCategory | null` in screen state; the design's `addG`).
- Tapping the dashed button replaces it with the inline field. The field entry animation: opacity 0 -> 1 and translateY -6 -> 0 over 280 ms ease-out; input auto-focuses (cursor ready). Haptic: `lightHaptic()` (current code fires one on focus; keep one).
- Submit via keyboard return key (`returnKeyType="done"`, `blurOnSubmit={false}` so the keyboard stays for rapid entry) or the "+" button. Empty/whitespace is ignored. The field clears and stays open and focused. The new item is appended at the end of the unticked items of that aisle (the existing optimistic update already does this).
- New row entry animation ("fresh", `s1add`): translateY -10 -> 0 and opacity 0 -> 1 over 320 ms ease-out, row clipped. Play it only for ids added locally in the last 1.6 s (a `freshIds` ref set), never on list mount or FlatList windowing remounts. No flash (the final `.sf` build dropped it).
- Closing the field: blur with empty text collapses it back to the dashed button (fade 200 ms is acceptable, the design only specifies Escape on web). Blur with non-empty text submits it first, then closes. Collapsing the aisle also closes it.
- Parsing: the design guesses an aisle from the text only for the global add (not in the final design). Not needed; the category is always the aisle's.
- Placeholder: `t('shoppingList.addToAisle', { aisle })` where aisle is the translated category name.
- Repeated taps: keep the existing `submittingRef` guard (released next frame) and rely on client-generated ids for idempotency on the backend.

### 2.6 Clear done

- Design: tap "Clear done" immediately animates; no confirmation, no toast, no undo (the toast+undo variant is `a3`, not picked).
- **Decision: keep the native `ActionSheetIOS` destructive confirmation** (existing, there is no undo API). Tap "Clear done" -> sheet (title `clearDoneConfirm`, destructive "Clear completed", Cancel) -> on confirm play the design animation. Medium impact haptic on confirm, as today.
- Animation (Set 1 "Calm", `s1out`, 450 ms ease): every visible ticked row simultaneously (ON: all ticked rows; OFF: the rows still in the grace window, usually none): opacity goes 0.45 -> 0 by 45 % of the duration while max height stays natural, then max height -> 0 and padding/border -> 0 by 100 %. No stagger (`stag: 0`). After 490 ms (450 + 40) fire `clearCompleted.mutate()`; the optimistic removal then removes already-invisible rows. When no ticked row is visible (or Reduce Motion / VoiceOver is on) fire the mutation immediately after confirmation. `Haptics.notificationAsync(Success)` when the animation ends.
- Drag interaction: Clear done is not available while a drag is active (the control sits in the list header and the list ignores touches during a drag; also guard with `dragActiveRef`).
- Guards: `clearPendingRef` plus a `clearing` state; the button is disabled/hidden while clearing so repeated taps are no-ops. On mutation error the optimistic rollback restores the rows; show them with the normal expand-in and surface `Alert.alert(t('common.somethingWentWrong'))`.

### 2.7 Drag-to-reorder, live household updates and presence

Library: **`react-native-drax` 1.1.0**, pinned exactly in `apps/mobile/package.json` (pure JS, no native code, no rebuild). Its cross-container API (`useSortableBoard`, `SortableBoardContainer`, `useSortableList`, `SortableContainer`, `SortableItem`) is marked experimental. `react-native-draggable-flatlist` stays installed because `ShoppingCategoriesScreen` still uses it.

Wiring:
- `index.tsx` renders `DraxProvider` (`onDragStart`/`onDragEnd`) > `SortableBoardContainer` (board from `useShoppingDrag`) > one plain `ScrollView` > presence bar, progress card, one `AisleCard` per enabled category. Six cards with mapped rows: the rows are not virtualised (cards plus cross-card drag rule out a virtualised list here).
- Each `AisleCard` calls `useAisleSortable` (wraps `useSortableList`, id `aisle-${category}`, data = the aisle's unticked items, key = item id). The body's `SortableContainer` holds the sortable rows (`SortableShoppingRow` = `SortableItem` + `ShoppingItemRow`), an animated drop spacer, then the ticked rows and the add row (plain children, not sortable). Because the container spans the whole body, empty aisles and the area over ticked/add rows are valid drop targets.
- **Activation:** long-press (`LONG_PRESS_MS` 250) on the item text area: `SortableItem dragHandle` + `DraxHandle` around the text. Tap on the text still starts inline edit (the RNGH pan cancels the JS responder once it activates). Swipe-to-delete wins horizontal movement because the long-press pan fails on movement. Not draggable: ticked rows (outside the sortable list), rows locked by another user, the row being edited, and every row while `clearing`, a tick/row animation, or an aisle slide is running (`dragLocked`, written to Drax's `dragLockedSV` and checked when the gesture activates; rows' `draggable` props do not change).
- **Lift:** Medium haptic in `DraxProvider.onDragStart`. The hover is `DragPreviewRow` (`renderHoverContent`): a full rounded card, hairline ring, subtle shadow, scale `LIFT_SCALE` via `hoverDraggingStyle` (no scale with Reduce Motion). The original slot is hidden and neighbours shift aside (Drax shift transforms, `animationConfig: 'none'` with Reduce Motion). Snap on drop 200 ms, no delay.
- **Within an aisle:** `onReorder` -> `withReorderedAisle` -> `reorder.mutate(categoryOrdersFromAisles(...))`.
- **Across aisles:** leaving the source card ejects the row (source rows close up, source spacer animates to `-height`); over a target card a phantom slot opens (target rows animate aside, target spacer animates to `+height` so the card grows instead of rows overlapping the add row). `onTransfer` -> `withTransferredItem` -> the same `reorder.mutate`, which recategorises (`reorder` accepts `categoryOrders`, the backend writes category + position for every active item). Mapping for the displayed `'other'` bucket: items whose category is disabled keep their real category; an item dropped into Other from an enabled aisle becomes `other`.
- **Collapsed aisles:** dropping on a collapsed card (its header) inserts at the end of that aisle; the hover snaps to the header. Collapsed cards never grow a spacer.
- **Drop position:** dropping below the last row of a target (over ticked rows or the add row) appends to the end of the unticked group.
- `categoryOrdersFromAisles` uses the live `incompleteItems` as the source of truth: rows deleted remotely during the drag are dropped, items added remotely are appended to their own category (the backend requires every active item exactly once).
- **Haptics:** `selectionHaptic()` on each slot change (within the source via `onDragPositionChange`, across aisles when the board's target/slot changes) and on drop.
- **Auto-scroll:** `useDragAutoScroll` scrolls the page with a rAF loop while the hover is within 72 pt of the top/bottom clearance; the ScrollView's own scrolling is disabled during a drag (`scrollLocked`).
- **Live updates during a drag are buffered:** `useShoppingDrag` freezes the displayed aisles at drag start (`dragAisles`); live data keeps recomputing underneath. Drax resets its shift state whenever a list's data identity changes, so this is mandatory. After a drop the optimistic result stays displayed until live data has the same order (or the mutation settles / fails). Aisle objects are structurally shared (`reuseUnchangedAisles`) so unrelated changes do not reset other cards.
- **Tick sequence vs drag:** `dragActiveRef` defers every timer-driven tick step; the session ends after Drax's snap (`onSnapEnd` + one frame, after `onReorder`/`onTransfer`) or a 1 s fallback, then `resume()` runs deferred steps. Clear done and collapse are refused while `dragActiveRef` is true.

**Drax 1.1.0 limitations found in the source and worked around (all in `useAisleSortable.ts`):**
1. Drax measures a container with Fabric `measureLayout` against the provider root, and Fabric's `measureLayout` uses `includeTransform: false`, which excludes the ScrollView content offset. The board compares the finger's root position with `containerMeasurementsRef`, and monitor offsets come from each container's raw measurement, so columns inside a scrolling page would be detected in the wrong place. Workaround: every card re-measures its body on screen (`measure()` pageX/pageY minus the provider root offset) on touch start, on layout, after each render (Drax re-measures on re-render) and while auto-scrolling, then pushes the result into Drax with `useDraxContext().updateMeasurements(id, rect)` and `containerMeasurementsRef`. Containers are not nested in `DraxScrollView` on purpose: nested monitors get parent-relative offsets.
2. `getSlotFromPosition` caps an incoming (cross-container) drop at `length - 1`, so the end of a non-empty target was unreachable. Wrapped: positions below the target's last row return `length`; collapsed targets always return `length`. `getPhantomSnapTarget` is wrapped for collapsed targets (snap to the header).
3. `SortableItem` reads `onItemSnapEnd` from the per-render internal object during render, but `SortableContainer` assigns it in a layout effect afterwards, so with directly mapped (non-FlatList) items the drop never finalised. Wrapped with a getter/setter trampoline.
4. When dropping into a target whose first row has a different height, Drax animates the hover to that row's size during the snap (cosmetic).
5. `SortableItem` sets hardcoded English accessibility label/hint/role; they are overridden with `undefined`.

Presence and live updates (unchanged hook, re-skinned):
- `PresenceBar` (avatars of other users) stays above the progress card. It is a deviation from the design (which has none); kept because it is an existing feature.
- A row being edited by someone else: text shown non-editable with a trailing `lock` SF Symbol (`palette.textTertiary`, 14pt), under the text the existing badge (coloured dot + "{{name}} is editing") using `typography.badge` (12pt) and `palette.textSecondary`. Ticking stays allowed, dragging does not.
- Own inline edit: tap text -> `TextInput` (autoFocus, `returnKeyType="done"`, `autoCapitalize="sentences"`, `autoCorrect`), `setEditing(id)` on start, `setEditing(null)` on submit/blur, commit via `editText.mutate` only when changed and non-empty (existing `handleEditSubmit` logic). Haptic `Haptics.ImpactFeedbackStyle.Rigid` on start as today.
- **Swipe-to-delete (`Swipeable` + red action) is kept.** It sits on the row inside the card; the action background is clipped by the card radius (see 4.3). Deleting plays the "out" row animation (3.4, 280 ms) and then calls `remove.mutate`; no `LayoutAnimation`. VoiceOver: expose custom accessibility actions "Delete" (and the existing edit).
- Remote updates arriving mid-animation: animations are keyed by item id and driven off the per-row phases, `freshIds`/`clearing` and the data; incoming data never cancels a running move, it only changes the destination (the transition retargets).

### 2.8 Backend gaps

None blocking. Optional, not part of this spec: (a) a "Bakery" category; (b) an undo endpoint for Clear done (restore completed items) which would allow dropping the confirmation and adding an Undo toast (`ScreenToast`, see 4.4).

### 2.9 Repeated-tap safety (project rule)

| Action | Guard |
|---|---|
| tick/untick | each tap is a valid toggle (ignored while a drag is active); the hook's serial write queue keeps the server consistent and the server compares `completed` only after locking the category rows, so duplicate concurrent requests apply once; an error rolls the row back only if that tap is still the latest for the row, and surfaces one "change not saved" alert per burst; `useTickSequence` keys timers by id and clears/restarts them on every flip so rapid taps never leave a row stuck at height 0 (see cleanup rule in 3.7); pop replays only on a false -> true transition |
| add | `submittingRef` released on next frame, client uuid ids, empty ignored; a failed add removes the optimistic row and shows the "change not saved" alert (one per burst) |
| clear done | `clearPendingRef` + `clearing` state, control hidden/disabled while running |
| collapse | pure toggle that retargets the running `withTiming`, idempotent persistence write (last write wins), ignored during a drag |
| edit submit | blur + submitEditing can both fire: guard with a ref so the mutation fires once |
| drag | rows are not draggable while `clearing`, while a row or aisle animation runs, or while a drag session is active; `reorder` is queued by the hook's serial write queue and idempotent (full `categoryOrders` snapshot) |
| delete | row id added to a `deletingIds` ref on swipe action press; second press ignored until removed; a failed delete expands the row back and shows the "change not saved" alert (one per burst) |
| open add field | opening another aisle's field closes the current one |

---

## 3. Animations (Reanimated 4, UI thread)

Rules for all of them:
- Use `useReducedMotion()` (already how the app does it, e.g. `useMotion`). With Reduce Motion on: no pop/slide/collapse/cross-out animation; checkbox fill and opacity change instantly; reorder happens immediately at tick time (the move transition is blocked); clear done removes rows immediately; chevron and progress snap. Haptics still fire. The same immediate path is used when VoiceOver is running (`AccessibilityInfo.isScreenReaderEnabled()` read once through a small hook), because rows moving under the VoiceOver cursor is disorienting; announce the move instead (3.8).
- Drive everything with shared values + `useAnimatedStyle` and `withTiming`/`withSequence`. No JS-thread timers drive frames. JS timers (`setTimeout`) are used only to flip *data* phases (move/collapse phases), because that is a data decision; keep them in `useTickSequence` and always clear on unmount and on id re-flip.
- Animate only `opacity`, `transform`, and (for the row collapse) `maxHeight` of a single row wrapper.

### 3.1 Tick (Set 2 "Satisfying")

On the checkbox (new `celebrate` variant, section 4.2):

1. **Pop**: scale 1 -> 1.25 at 40 % -> 1 at 100 %, 450 ms total, easing `Easing.bezier(0.2, 0.9, 0.3, 1.4)` applied per segment: `withSequence(withTiming(1.25, { duration: 180, easing }), withTiming(1, { duration: 270, easing }))`.
2. **No ring burst, tick wipe or row flash** (removed after device testing): the tick is shown immediately inside the fill and only the scale pop remains.
4. **Fill**: the orange fill appears instantly when ticking (the design switches `background` with no transition); the default `CheckboxCircle` 180 ms fade is retained for unticking.
6. **Row dim / cross-out**: row opacity 1 -> 0.45 over 250 ms `withTiming`; the strike is an animated line per text line drawn after the slide (`mobile-shopping-list-tick-move.md`).
7. **Slide to the ticked group**: section 2.4 (`mobile-shopping-list-tick-move.md`).

Haptic at t = 0: `lightHaptic()` (matches today's Light impact). Untick: `selectionHaptic()`.

### 3.2 Untick

Checkbox fill fades out 180 ms (existing), row opacity 0.45 -> 1 in 250 ms, no pop/flash/ring. Reorder per 2.4.

### 3.3 Add item

Field wrapper: `entering` with a custom worklet (opacity 0 -> 1, translateY -6 -> 0, 280 ms `Easing.out(Easing.cubic)`). New row: custom `entering` (translateY -10 -> 0, opacity 0 -> 1, 320 ms ease-out) applied **only** when the id is in `freshIds`; otherwise `entering={undefined}`. Reanimated runs `entering` for every first mount including list windowing, so the gate is mandatory. Apply these on an inner `Animated.View` in the row, not through Drax's `itemEntering`, which is one value for every item. The inner view animates transform and opacity only, so the row's measured height is not affected.

### 3.4 Row height animations (collapse, expand, clear, delete)

One reusable `useRowCollapse` driven by a single shared value `open` (1 = natural height, 0 = collapsed) and the measured natural height (`naturalHeight` shared value written from `onLayout` of the inner content; the design's literal `64px` max-height is replaced by the measured height so wrapped text rows animate correctly). The collapsing wrapper sits inside `Swipeable`, so the `SortableItem` and the card body just follow its size:

```
wrapper style (useAnimatedStyle): { maxHeight: open * naturalHeight (only while animating), opacity: ..., overflow: 'hidden' }
inner content: normal layout, fixed paddings/borders (clipped, not animated)
```
- Tick no longer collapses: the row slides to its new place (2.4). `moving` is treated like `idle` by `useRowCollapse`. Collapse remains for delete and grace expiry.
- Expand (delete rollback): `open` 0 -> 1, 320 ms `Easing.out(Easing.quad)`, opacity 0 -> 1.
- Clear out: opacity 0.45 -> 0 over the first 45 % (203 ms) while `open` stays 1, then `open` 1 -> 0 for the rest, total 450 ms, `Easing.inOut(Easing.ease)`. Implement with one progress value 0..1 mapped with `interpolate`.
- Delete out: same as tick collapse (280 ms ease-in), then `remove.mutate`.
- Outside an animation the style must be `undefined`/no maxHeight so normal height wins (avoid a stale `naturalHeight` clipping a row after the user changes the text size, wrap changes, or edit mode). Set `maxHeight` only while `animating.value` is true.
- Siblings reflow because the row's own height changes each frame on the UI thread. Rows always carry the aisle's move transition (`createMoveTransition`), but it snaps while any of these height animations runs in that aisle, so siblings follow the collapsing row frame by frame.

Drag interaction rules: (a) **row height animations are suspended during a drag**: `useTickSequence`, `useClearDone` and delete steps are deferred while `dragActiveRef` is true (Drax reads row measurements for slot maths); (b) **drag is unavailable while any row or aisle animation runs** (`dragLocked` → `dragLockedSV`, no prop changes); (c) opacity/transform/flash/pop animations are unaffected and may run during a drag.

### 3.5 Collapse aisle

Section 2.3: body slide (translateY + clip height from one `progress` shared value, 420 ms `AISLE_SLIDE_EASING`), chevron 0 <-> 180deg and header divider opacity from the same value.

### 3.6 Progress bar

Width 0 -> n % `withTiming` (existing `ProgressBar` determinate path, 250 ms; the design says 300 ms, trivial).

### 3.7 List structure: decision

Decision (user, after device testing of the flat-list version): **one card view per aisle inside one ScrollView, drag via `react-native-drax` 1.1.0.** The earlier `DraggableFlatList` of flat rows, where each row painted a slice of its card and collapse was faked per row (slide ranks, shift-above, concealed rows, animated header corners), glitched on device (flash of the full list at open, corners going sharp then round, other aisles breaking when an aisle above opened, stutter) and was removed.

| Option | Verdict |
|---|---|
| `DraggableFlatList` of flat rows with per-row card slices | Removed (glitches above, collapse cannot be one animation). |
| `FlashList` | Rejected: recycling replays per-row shared values, no cross-list drag. |
| **ScrollView of six `AisleCard`s, Drax board for drag** | **Chosen.** Real cards make collapse one UI-thread animation; Drax gives animated in-aisle reorder and cross-aisle transfer. Rows are not virtualised (six aisles; a shopping list is tens of rows). |

Memoisation: `AisleCard` is `memo`; it receives a stable `handlers` object, its own aisle object (structurally shared), its own per-row phase map (`aislePhases` + `isSamePhases`), and per-category shared values. A tick re-renders the affected card, the header counts and the progress card; within the card only rows whose index, item or phase changed re-render (`SortableShoppingRow` is memoised). Drag lock and move arming are shared values and re-render nothing.

### 3.8 Haptics and announcements summary

| Interaction | Haptic | VoiceOver |
|---|---|---|
| tick | `lightHaptic()` | `AccessibilityInfo.announceForAccessibility(t('shoppingList.tickedAnnouncement', { item, aisle }))` |
| untick | `selectionHaptic()` | `untickedAnnouncement` |
| add item | `lightHaptic()` | announce `itemAddedAnnouncement` |
| open/close aisle | `selectionHaptic()` | `accessibilityState.expanded` |
| clear done | Medium at confirm, Success notification at end | announce `clearedAnnouncement` |
| begin edit | existing Rigid impact | n/a |
| drag lift | Medium impact (existing) | n/a (VoiceOver has no drag; reordering is not available to VoiceOver users, same as today) |
| drag slot change | `selectionHaptic()` | n/a |
| drop | `selectionHaptic()` | n/a |

Add helpers `mediumHaptic()` and `successHaptic()` to `src/components/ui/haptics.ts` (existing file only exports `lightHaptic`, `selectionHaptic`).

---

## 4. Component architecture

### 4.1 File tree after the change (`apps/mobile/src/screens/ShoppingListScreen/`)

```
index.tsx                 screen: queries, DraxProvider + SortableBoardContainer + ScrollView, aisle cards, handler wiring
helpers.ts                ShoppingAisle type, buildShoppingAisles(), reuseUnchangedAisles(), hasSameAisleOrder(), withReorderedAisle(), withTransferredItem(), categoryOrdersFromAisles(), aisleSortableId()/categoryFromSortableId(), aislePhases()/isSamePhases(), createCategoryValues(), progress math, visibleShoppingCategories(), displayedShoppingCategory()
styles.ts                 the one shared StyleSheet (card, header, rows, lifted row, progress card, field, dashed button)
motion.ts                 timing constants, easings, freshEntering, fieldEntering
AisleCard.tsx             header + clip/slide body + SortableContainer (sortable rows, drop spacer, ticked rows, add row)
AisleHeaderRow.tsx        title, left label, chevron + divider driven by the aisle progress value, accessibility
SortableShoppingRow.tsx   SortableItem (drag handle, hover preview, snap) around ShoppingItemRow
ShoppingItemRow.tsx       Swipeable + collapse wrapper + Checkbox(celebrate: pop only) + text/edit + StrikeLines (DraxHandle) + lock badge
DragPreviewRow.tsx        lifted hover card shown while dragging
ItemTextEditor.tsx        TextInput with focus underline
AddItemRow.tsx            dashed button <-> inline field (local text state)
ProgressCard.tsx, PresenceBar.tsx, PresenceChip.tsx
useAisleCollapse.ts       per-category progress shared values, toggle, persistence, ready/transitioning flags
useAisleSortable.ts       useSortableList + Drax adaptations (section 2.7) + on-screen column geometry
useShoppingDrag.ts        board, drag session, data freeze, reorder/transfer -> mutation, drop spacers
useDragAutoScroll.ts      page auto-scroll during a drag
useDragGeometry.ts        scroll offset ref + geometry refresh events for the cards
useTickSequence.ts        tick/untick timeline, grace, remote changes, drag deferral, `animating` flag
useRowCollapse.ts         row open/clear/dim shared values (tick, delete, clear, grace)
useClearDone.ts, useItemEditing.ts, useKeepScreenOn.ts
```

### 4.2 Shared component changes (`src/components/ui`)

**Single checkbox implementation.** The repo already has one circle: `CheckboxCircle` (and `Checkbox`, its pressable wrapper) in `ui/Checkbox.tsx`. It is already used by `SelectionRow` (SelectionDrawer), `IngredientRow` (Recipe Details grocery mode), `AllergenSection` (Settings), `CookModeScreen/IngredientParts`, and wrapped by `ShoppingListScreen/CheckCircle`. The only duplicate is `ShoppingListScreen/CheckCircle.tsx` (its own Pressable, own 24pt size, own 0.9 -> 1.12 scale, own hit slop). Do not create another checkbox. Extend the shared one:

```ts
// ui/Checkbox.tsx
interface CheckboxCircleProps { checked; itemKey?; size?; celebrate?: boolean }   // celebrate = scale pop on false -> true only
interface CheckboxProps { checked; onToggle; accessibilityLabel; celebrate?: boolean; haptic?: 'selection' | 'light' | 'none'; size?: number }
```

- `celebrate` defaults to false so every existing caller renders **byte-for-byte as today** (zero migration for SelectionRow, IngredientRow, AllergenSection, CookMode).
- `celebrate` plays only when `checked` flips false -> true on a mounted component; the existing `itemKey` recycled-cell guard also suppresses it on key change and on first mount.
- `Checkbox` gains `haptic` (default `'selection'`, current behaviour) so shopping can pass `'none'` and fire its own tick/untick haptics (they differ per direction and happen in `useTickSequence`).
- Keep `HIT_SLOP` 9 (visual 26pt + 18 = 44pt).
- Delete `ShoppingListScreen/CheckCircle.tsx`; the row uses `<Checkbox celebrate haptic="none" ... />`.

Migration list (explicit, minimal): only `ShoppingListScreen` changes callers (CheckCircle -> Checkbox). No other screen is touched. Optional follow-up, not in scope: use `celebrate` in Recipe Details grocery mode rows.

**`ui/ProgressBar.tsx`**: add `size?: 'regular' | 'thick'` (regular 4pt as today, thick 6pt); default unchanged. Optional `duration` is not added; 250 ms is accepted.

**`ui/haptics.ts`**: add `mediumHaptic`, `successHaptic`.

**Reused as is**: `AppText`, `palette`/`radius`/`space`/`typography`, `usePressScale` (apply to the "Clear done" text button and the Add item button via `Pressable` + `Animated.View`, as `Card` does), `Card` is **not** used for aisle cards (a card spans several list rows here) but the same `palette.card` + `radius.card` tokens are used.

### 4.3 Card layout

`styles.card` (margin 20 horizontal, `marginTop: 12`, radius 20, `palette.card`, `overflow: 'hidden'`). The header has `paddingTop: 4` and horizontal 16, then a 1pt divider faded by progress. Rows paint `rowSurface` (horizontal padding 16, card fill so the swipe action hides behind it); the hairline lives on the inner row so it is inset 16 from the card edge. The add row has `paddingBottom: 8`. The swipe delete action is clipped by the card radius.

### 4.4 What gets deleted

- `CheckCircle.tsx`, `ShoppingCategorySection.tsx`, `sectionStyles.ts` (earlier step).
- Flat-list machinery: `aisleSlide.ts` (slide ranks, shift-above, clip maths), `DropPlaceholder.tsx`, the `ShoppingRow` model, `buildShoppingRows`, `normalizeShoppingListRows`, `categoryOrdersFromRows`, `hasSameShoppingListRowOrder`, `shoppingListRowKey`, `concealed`/`bodyIndex` props, the animated header corner radius, slice styles, `DRAG_ANIMATION_CONFIG_INSTANT`, `ESTIMATED_*` heights, `isAnimating`/`isTransitioning`/`canStartDrag` refs.
- `react-native-draggable-flatlist` stays in `package.json` (used by `ShoppingCategoriesScreen`).

### 4.5 Rules to follow while writing

- Components as `const` arrow functions, default exports, `memo` for rows/headers.
- Extract inline callbacks and style functions into named handlers (`handleXOnPress`), no multi-line inline JSX or inline `onPress` bodies, blank lines between steps, no comments unless the WHY is non-obvious (the `freshIds` gate and the `maxHeight` stale-clip rule deserve one line each).
- One shared `styles.ts`.
- Every `TextInput` sets `keyboardType`, `returnKeyType`, `autoCapitalize`, `autoCorrect`, `textContentType="none"` (free text).

---

## 5. Translations

Add to all seven locale files in `packages/shared/src/locales/` (`en, pl, de, fr, es, it, pt`; locale list is `packages/shared/src/supportedLocales.ts`) under `shoppingList`. English text:

| Key | English |
|---|---|
| `progressInCart` | `{{done}} of {{total}} in cart` |
| `clearDone` | `Clear done` |
| `aisleAllDone` | `All done` |
| `addItem` | `Add item` |
| `addToAisle` | `Add to {{aisle}}...` (use the typographic ellipsis as the existing `addItemPlaceholder` does) |
| `itemField` | `Item` (accessibility label of the edit field) |
| `gotItLabel` | `Got it: {{item}}` (checkbox accessibility label; if the team prefers the item text alone, drop this key) |
| `tickedAnnouncement` | `{{item}} ticked, moved to the bottom of {{aisle}}` |
| `untickedAnnouncement` | `{{item}} put back` |
| `itemAddedAnnouncement` | `{{item}} added to {{aisle}}` |
| `clearedAnnouncement` | `Cleared {{count}} items` with `_one`: `Cleared {{count}} item` and `_other` following the existing plural convention used by `aisleLeft` |
| `clearDoneConfirm` | `Remove {{count}} done items?` (`_one`/`_other`; used as the ActionSheet title if the confirm is kept) |

Existing keys reused: `shoppingList.title`, `shoppingList.categories.*`, `shoppingList.aisleLeft` (+ `_one`/`_other`), `shoppingList.presenceEditing`, `common.delete`, `common.cancel`, `common.somethingWentWrong`, `recipes.dragToReorder` (no longer used by this screen), `shoppingList.clearCompleted` (action-sheet destructive option, if kept). Existing keys that become unused on mobile but stay (web uses them): `completedSection`, `showCompleted`, `hideCompleted`, `addItemShort`, `aisleAllIn`, `inBasket`, `toGet`.

---

## 6. Native-first flags (user decides; do not silently build)

Per the rule "if a feature request requires a custom JS component where a native equivalent exists, say so first":

- **Resolution of all flags: F1 custom cards, F2 reuse the JS `ProgressBar`, F3 SF Symbol checkmark, scale pop only, F4 keep the "+" button, F5 keep swipe-to-delete, F6 keep the action sheet, F7 SF Symbol chevron.**
- **F1. Aisle cards.** This is a custom card list. Native alternative: a SwiftUI inset-grouped `List` through `@expo/ui` (`Host` + `List` + `Section`) gives native sections, swipe actions and collapsing sections for free. It cannot reproduce the picked tick pop/flash/collapse choreography, the progress card, or the app's `palette` warm neutrals, and it would break the visual parity with Recipe Details group cards. Recommendation: custom cards (as `DESIGN.md` already does for ingredient group cards).
- **F2. Progress bar.** Native `UIProgressView` has no RN component; `@expo/ui` has a SwiftUI `ProgressView` (linear) but it is not skinnable to the 6pt orange pill. Recommendation: reuse the existing JS `ProgressBar` (thick variant).
- **F3. Tick draw-in and checkbox pop/ring.** Custom Reanimated animation on the existing checkbox circle. Native alternatives: SF Symbol effects via `SymbolView` `animationSpec` (bounce / scale, and the draw-on effect on iOS 26+) give a native but different feel (no ring burst, not the picked "Satisfying" set, iOS-version dependent). Recommendation: keep the picked design using a wipe reveal on the SF Symbol checkmark (no `react-native-svg` dependency); optionally also apply a native `bounce` symbol effect on iOS 26+ if the pop reads too heavy.
- **F4. Inline add field with a "+" submit button.** **Resolved: keep the "+" button as in the design.**
- **F5. Delete affordance.** **Resolved: keep `Swipeable` swipe-to-delete.** Drag (long-press) uses Drax, a JS/RNGH gesture over native views, because there is no native iOS drag-reorder for a custom card list in RN.
- **F6. Clear done confirmation.** Native `ActionSheetIOS` (existing) vs the design's no-confirm. **Resolved: keep the native sheet.**
- **F7. Collapse chevron.** Use the SF Symbol via `SymbolView`, not a vector icon (the screen currently imports Feather for this; Feather is dropped from this screen).

No other custom control is introduced; the header, back behaviour and tab bar stay native.

---

## 7. Implementation steps

1. Theme/shared: add `typography.progressLabel`; add `size` to `ProgressBar`; add `mediumHaptic`/`successHaptic`; extend `Checkbox`/`CheckboxCircle` with `celebrate` and `haptic` (default behaviour unchanged). Add a throwaway story-like check by rendering `celebrate` in the shopping row only.
2. Translations: add all keys to the 7 locale files (section 5).
3. `ShoppingListScreen/helpers.ts`: new `ShoppingRow` types and `buildShoppingRows` (unticked by position, then ticked by position, `holding` treated as unticked, add row, collapsed handling, empty-aisle rule), `aisleLeftCount`, `progressOf`. Keep `visibleShoppingCategories`/`displayedShoppingCategory`. Add unit-style sanity checks by reasoning, no test runner exists for mobile.
4. Extract hooks from `index.tsx` without behaviour change: `useKeepScreenOn`, `useAisleCollapse`, `useItemEditing`. Typecheck.
5. `motion.ts` + `useRowCollapse` + `ShoppingItemRow` (static first: card, checkbox, text, strike, opacity, swipe delete, lock badge, edit). Drag with Drax (section 2.7): sortable rows per aisle card, board for cross-aisle transfer, lifted hover, haptics. Typecheck, run on device with no tick animations; verify drag within and across aisles first.
6. `ProgressCard`, `AisleHeaderRow` (chevron rotation), collapse persistence, collapsed/empty-aisle rendering.
7. `AddItemRow` (dashed button <-> field, entering animation, freshIds gate, blur rules, keyboard insets).
8. `useTickSequence` (one-render slide per `mobile-shopping-list-tick-move.md`, grace expiry deferred while the row is edited, setting ON/OFF branch, remote-change detection, `pause()/resume()` around drags, drag-start refusal while animating, reduce-motion + VoiceOver bypass, timer cleanup) wired to `toggle.mutate` and haptics.
9. `useClearDone` (confirm kept per recommendation, `clearing`, out animation, delayed mutation, guards).
10. Delete obsolete files and dead code (section 4.4). The Settings toggle and its keys stay.
11. Run verification (below). Commit only after the user confirms (project rule); include this spec in the commit and move it to `docs/specs/completed/` only when fully done.

### Verification

Typecheck (no script exists in `apps/mobile/package.json`):

```
cd /Users/michalkulesza/Projects/carrot/apps/mobile && pnpm exec tsc --noEmit
cd /Users/michalkulesza/Projects/carrot/packages/shared && pnpm typecheck
```

Manual test script on an iOS device (development build, `pnpm --filter mobile ios`), light then dark:

- Layout: compare to the design values in section 1 (card gutter 20, radius 20, row height >= 50, header 48, dashed add 48, field 48). Dark mode: card #26211C, rows readable, divider contrast (see 1.2), orange tick and ring visible, flash tint not glaring.
- Tick: pop; row dims to 45 %; the row slides straight to the bottom of its aisle under the other rows (450 ms) and the cross-out draws after the slide; counts and progress update at once. Untick mid-slide and after landing. Tick the first and last rows of an aisle; tick all items of an aisle ("All done"); tick in a collapsed aisle is not possible (rows hidden), verify no crash when collapsing an aisle mid-slide. A tap on a checkbox while a drag is active is ignored.
- Drag: long-press the text of an unticked row (Medium haptic, lifted card with shadow, neighbours shift aside, selection tick per slot change); drop within the aisle; drag into another aisle (target rows open a gap and the card grows, source card closes up; recategorised, survives relaunch and shows on web); into an empty aisle; below the last row / over ticked rows / over the add row (appends at the end); onto a collapsed aisle header (appends at its end, hover snaps to the header); into Other from an enabled aisle (becomes Other) and within Other (disabled-category items keep their category); autoscroll near the top/bottom edge of a long list, then drop into an aisle that was off-screen at drag start; scroll the page first, then drag (drop targets must line up with the scrolled cards); long-press on a ticked row, a locked row, the row being edited, or during a tick / aisle slide does nothing; swipe-to-delete and tap-to-edit still work and never start a drag; remote tick/add/delete from a second device during a drag appears only after the drop and does not cancel it; Reduce Motion on: no lift scale, no shift animation.
- Settings toggle: with "Show completed" ON ticked rows sink to the bottom and stay; with it OFF the row behaves the same for 10 s (sinks to the bottom, can be unticked), then collapses and disappears; progress still counts it, Clear done still appears and clears the hidden items. Rows ticked by another device with the setting OFF collapse and disappear without the 10 s window. Edit a ticked row while its grace window ends, while the setting is turned OFF from another device, and while another device ticks it: the row stays until the edit ends, then collapses; the typed text is saved and the presence lock clears.
- Rapid tapping: tap one checkbox 10 times fast, tap 5 different rows quickly, then check no row is stuck at height 0 or duplicated, final server state equals final UI state after pull-to-refresh/relaunch. Double-tap Add; hold return key; tap Clear done repeatedly.
- Add: open field (fade/slide, keyboard up, cursor), add 5 items quickly (rows slide in, keyboard stays), blur empty (field closes), blur with text (adds then closes), open another aisle's field (first closes). Add to an empty list.
- Clear done: confirmation, then rows fade and gap closes in ~0.45 s, items gone after relaunch; failure path (airplane mode): rows return and an alert shows.
- Collapse: body slides up under the header (no squish, no fade), card corners stay round throughout, chevron rotates, divider fades; tap rapidly to reverse mid-slide; aisles below follow smoothly; opening an aisle above another never breaks it; no flash of expanded aisles at screen open; state persists across relaunch and is per household; collapsed rows are not reachable by VoiceOver or touch.
- Edit: tap text, edit, submit; edit with an empty string reverts; edit lock badge when a second device edits the same item.
- Household live sync: two devices on the same household. Tick/add/delete/clear on device B and watch device A (same slide, no pop, no stuck rows). Presence avatars and "{{name}} is editing" appear and disappear.
- Reduce Motion ON (Settings > Accessibility > Motion): no pop, slide, collapse, cross-out animation; instant reorder; everything still works.
- VoiceOver ON: header announces name, count and expanded state; checkbox has "checkbox, checked/unchecked" and a sensible label; tick announces the move; rows reorder immediately; swipe-delete reachable through the Delete custom action; Add item field labelled; progress card read as a progress value.
- Dynamic Type at the largest sizes: rows wrap, row heights stay correct after collapse/expand (measured height, not 64).
- Performance: a 150-item list scrolls at 60 fps; ticking one row does not visibly re-render siblings (React DevTools / Perf Monitor).
- Regression: Recipe Details grocery mode checkboxes, SelectionDrawer rows, Settings allergen checkboxes and Cook mode ingredient checkboxes look and animate exactly as before (they use the changed shared component with `celebrate` off).

---

## 8. Decisions (all resolved by the user, nothing open)

1. **Drag-to-reorder stays and is animated, now with `react-native-drax` 1.1.0** (pinned exactly; experimental cross-container board API; user's choice) instead of `react-native-draggable-flatlist` on this screen. Rows lift on long-press of the text (scale + shadow + haptic), neighbours shift, rows can be dropped at a position in another aisle (recategorised via `reorder` with `categoryOrders`) or onto a collapsed aisle (end). Ticked rows are not draggable. Tick sequence and row height animations are deferred during a drag; live updates are buffered. See 2.7 for the Drax adaptations.
2. **"Show completed shopping items" setting stays.** ON: ticked rows stay dimmed and struck at the bottom of their aisle until Clear done. OFF: the same sequence, then the row is removed with the collapse animation after the existing 10 s grace window unless unticked. See 2.2 and 2.4.
3. **All enabled aisles are always shown**, empty ones too, each with its "+ Add item" row (section 1).
4. **Clear done keeps the native `ActionSheetIOS` confirmation**, then the calm fade + gap-close animation (2.6).
5. **Bakery: ignored**, no new category (2.1).
6. **Native-first flags resolved** as recommended: custom cards, reuse the JS `ProgressBar`, SF Symbol checkmark with wipe reveal, keep the "+" submit button, SF Symbol chevron, keep swipe-to-delete (section 6).
7. **One card view per aisle with a web-style collapse** (body translateY + clip height from one shared value, 420 ms), replacing the flat list of card slices. See 2.3 and 3.7.
