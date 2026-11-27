# Shopping list: ticked rows slide into the done group (Reminders-style)

Status: implemented, pending device verification. Scope: `apps/mobile`, `packages/shared` (toggle mutation) and the `react-native-drax` pnpm patch. Builds on `docs/specs/mobile-shopping-list-aisle-cards.md` (§2.4, §3.4, §3.7) and replaces its "collapse then re-expand" tick/untick sequence.

Read first: root `CLAUDE.md`, `~/.claude/CLAUDE.md`, `apps/mobile/AGENTS.md`.

## Goal

A tap on a row's checkbox is **one render** that flips the data and starts the move: the checkbox fills with its tick and pops, the row dims to gray, and in the same commit the row starts sliding to its new place while the rows it passes slide by one row. The moving row passes **underneath** the other rows (Apple Reminders). Nothing collapses or re-expands; the card height does not change. Nothing heavy re-renders while the slide runs.

## Behaviour

| t (ms) | Event |
|---|---|
| 0 | One render: optimistic cache flip, phase `ticking` (untick: `moving`), checkbox fill (tick shown at once) + scale pop, dim to 0.45 (250 ms), "left" + progress update, haptic. The row is already at its new data position, so its frame change starts the slide in this commit. |
| `MOVE_MS` (450) | Phase cleared; the cross-out then draws left to right (below). |
| 10 000 (setting OFF, tick only) | Grace expiry: `removing` collapse (280 ms), then the row leaves the data. Deferred until the edit ends if the row is being edited. |

- **Untick** is symmetric: the row slides to its restored place (`shopping-list-untick-restores-position.md`). A sliding row (phase `ticking`/`moving`) has `pointerEvents="none"`, so taps fall through to the row settling under the finger; it cannot be re-tapped until it lands. Programmatic and remote re-flips still retarget from the current animated frame (Reanimated starts the new transition from the in-flight frame); timers are cancelled and restarted per id, so any number of rapid taps on one or several rows ends settled.
- **Remote changes** (another household member): setting ON, or any remote untick, take the same `moving` slide (no pop). Setting OFF remote tick: row pinned in place (`stay`), `collapsing` 280 ms, then unpinned (gone); if this device is editing that row it slides like a local tick and stays in `grace` until the edit ends, then expires. Turning the setting OFF while a ticked row is edited holds that row the same way. The diff against the previous items runs **during render** (`useTickSequence`), so the reorder and the phase/pin land in the same commit.
- **Reduce Motion / VoiceOver** (`instant`): no phases; the reorder snaps (the aisle's transition is blocked) and the strike is fully drawn at once.
- **Cross-out** (`useStrike`, `StrikeLines`, `strikeHelpers.ts`): no `textDecorationLine`. The item text's `onTextLayout` lines (kept in a ref, copied to state only while ticked) give one absolutely positioned 1.5pt line view per text line (`palette.ink`, so it dims with the row), vertically centred on `y + height/2`. A single `progress` shared value (0 to 1, `withTiming`, `STRIKE_EASING` ease-out, `clamp(totalWidth * STRIKE_MS_PER_PT, 150, 250)` ms, `STRIKE_MS_PER_PT` 0.75) drives every line on the UI thread: each line owns a `[start, end]` slice proportional to its width and reveals with `scaleX` from its left edge, so line 1 completes before line 2 starts. It starts when the row's phase leaves `ticking`/`moving` while completed (so after the slide, or right after the phase ends when nothing slid). Untick resets it to 0 at once. Rows ticked at mount, remote ticks without a phase, instant ticks and Reduce Motion render it at 1; re-wraps re-measure through `onTextLayout`.
- **Drag**: no drag can start while any row phase is set, while Clear done runs or while an aisle slides (global lock, below). Timer steps are deferred while a drag session is active, and checkbox taps during a drag are ignored.

## Mechanism

### 1. One render per tap

- `useShoppingList` toggle `onMutate` writes `toggleShoppingItem(...)` to the cache **before** awaiting `cancelQueries`. `useMutation.mutate` runs `onMutate` synchronously up to its first `await`, and `useQuery` reads the cache during render (`getOptimisticResult`), so the screen render triggered by the tap's tick state already contains the flipped data; the later query notification finds an unchanged snapshot and does not re-render. TanStack's `cancelQueries` reverts an in-flight fetch to the latest *manual* write (`#revertState` is updated by every `setQueryData`), so the optimistic write survives it. After the await the toggle is re-applied only if this action is still the latest for that id and a fetch overwrote it (no-op otherwise). Error rollback (`actionId`) is unchanged; the screen resets the row's phase/grace and `intendedRef` only when the failing tap is still the latest for that id (per-id counter), so a failed earlier tap cannot clobber a later one. The screen uses `mutateAsync` per tap because TanStack only calls per-`mutate` callbacks for the latest call.
- `useTickSequence.startTick` / `startUntick` set the phase (and clear any pin) in a single state update, no `stay` pin, no hold, no timer before the move. `Checkbox`'s `optimistic` override is gone: the row's `completed` prop flips in the same render.
- Drax patch: `useSortableList` adopts new data during render when no shifts are in play (no committed/pending order, no board hand-off), instead of a commit followed by a synchronous re-render from its layout effect.

### 2. The transition is armed at rest

Every row's Drax outer view (`SortableItem` `outerLayout`, patch) permanently carries one per-aisle custom layout transition from `createMoveTransition` (`motion.ts`): frame origin animates over `MOVE_MS` with `MOVE_EASING`, size snaps. It is a stable function per aisle (`useMoveTransition`), so it never needs to be toggled one commit ahead. It reads three shared values when Reanimated starts it on the UI thread; if any is set the frame change snaps instead:

- aisle rest blocker (`AisleCard`): `instant`, the aisle's collapse slide, a row being edited in the aisle, or any row phase that animates height (`collapsing`, `expanding`, `removing`, `clearing`);
- aisle add hold (`useMoveTransition.handleAdd`): set when the user submits a new item, released one frame after the commit that contains the new row (1 s fallback);
- board drag blocker (`useShoppingDrag`): set at drag start, released `DRAG_MOVE_REARM_MS` (400 ms) after the session settles, which covers Drax's permanent-shift flush 300 ms after the drop and the drop-space collapse.

Arming/disarming writes shared values only; no row re-renders. `outerStyle`: rows in `ticking`/`moving` get `zIndex: 0`, all others `zIndex: 1` (`rowStackStyle`), so the moving row draws under the opaque `palette.card` rows it passes.

### 3. Global drag lock without prop changes

`dragLocked = clearing || tick.animating || sliding.size > 0` is written to a shared value passed to `DraxProvider` (`dragLockedSV`, patch). The patched `useDragGesture` ignores a gesture that activates while it is set. Rows' `draggable` props no longer flip, so no per-row `setState` + RNGH v2 gesture rebuild happens when a tick starts or ends.

### 4. Nothing heavy re-renders during the slide

- `SortableShoppingRow` is memoized and ignores the per-render `sortable` handle, comparing the row's item (`sortable.data[index]`) instead; only the moving row, rows whose index changed, and the row whose phase settles re-render.
- Drax patch: `DraxProvider` routes its registry/dispatch functions through stable wrappers, so its context value no longer changes on every provider render (which previously re-rendered every `AisleCard`, `SortableItem` and `DraxView` on any screen render, e.g. the toggle mutation's own status updates mid-slide). `useDragGesture` memoizes its pan config and `DraxView` memoizes the `DraxHandle` context value, so a `DraxView` re-render no longer rebuilds and re-attaches its gesture.
- Server snapshots/SSE go through `setQueryData`, which structurally shares unchanged items, so unchanged aisles and rows keep identity.
- Layout animation frames are applied in the mount layer only; `onLayout` and Drax measurement see the target frame once per commit, not per frame.

## Drax patch summary (`patches/react-native-drax@1.1.0.patch`)

Edited in `src/` (Metro) and `lib/module` (+ `lib/typescript` types where the API changed): lazy `useState` initializers in `useDraxPanGesture`; `SortableItem` `outerLayout` / `outerStyle`; `DraxProvider` `dragLockedSV` + stable context callbacks; `useDragGesture` lock check + memoized config; `DraxView` memoized handle context; `useSortableList` render-time data adoption.

## Edge cases to check on device

- Tick the top row of an aisle with 4+ items: it slides down under the others at once, no delay, no hitch at the start or end.
- Untick: slides back to its restored place. Rapid taps on one row and on several rows: no stuck dim/phase, final state matches the last tap.
- Tick the last unticked row: no visible move, no glitch.
- Setting OFF: row slides to the bottom, collapses and disappears 10 s after the tick.
- Remote tick/untick from a second device, both settings.
- Add an item (setting ON with ticked rows below): the ticked rows jump, they do not slide.
- Delete, delete failure (expand back), Clear done, edit text, aisle collapse/expand.
- Drag within and across aisles; long-press during a slide does nothing; a tick right after a drop (within ~0.7 s) snaps instead of sliding.
- Reduce Motion and VoiceOver: instant.
