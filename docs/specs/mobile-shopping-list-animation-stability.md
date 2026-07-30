# Mobile Shopping List Animation Stability

## Status

Pending implementation.

## Context

The mobile shopping list currently produces duplicated and discontinuous motion when an item is added or completed, and abrupt reflow when completed items are cleared. The visible symptoms are caused by list identity changes and by multiple animation layers that do not coordinate with the installed draggable-list stack.

This plan supersedes only the animation guidance in `docs/specs/completed/shopping-list-native-categories.md`. It does not change the category, presence, editing, drag-ordering, completion-grace, or shopping-list persistence behavior established by that specification.

## Findings

1. `shoppingListRowKey` changes the identity of the same logical item:
   - A newly added optimistic item starts with a `temp-*` ID, then receives the server UUID after the request succeeds.
   - Completing an item changes its key from `item-{id}` to `completed-{id}`; uncompleting it changes the key back.
   - React therefore destroys the old row and creates a new row. Reanimated runs the old row's exit and the replacement row's entry animations, which appears as two animations on one action.
2. `FadeInDown` gives the replacement row an initial positive Y translation. The second mount consequently looks like the already-created row moves up from below.
3. `itemLayoutAnimation={LinearTransition...}` is ineffective with the installed `react-native-draggable-flatlist` 4.0.3 unless `enableLayoutAnimationExperimental` is enabled.
4. Enabling that flag without further work is not an acceptable fix. The installed library's experimental implementation references legacy Reanimated layout-animation internals, while the app uses Reanimated 4.3.1 and React Native's New Architecture through Expo SDK 56.
5. Entry and exit animations currently live on an `Animated.View` nested inside the draggable list's animated cell. Under the New Architecture, removal of the outer cell is not guaranteed to wait for a nested child's exit animation.
6. Clearing completed items is already one optimistic cache update, but the completed rows and the conditional Clear completed header disappear in the same layout pass without a working survivor-row transition. The result is a snap or staged-looking clear rather than one coordinated transaction.
7. Reduced Motion is already respected and must remain so.

## Goals

- Animate each user action exactly once.
- Preserve one stable row identity from optimistic creation through server confirmation.
- Preserve that identity when an item moves between incomplete and completed positions.
- Make add, complete, uncomplete, delete, grace-period removal, and Clear completed reflow smoothly.
- Keep drag motion independent from add/remove layout motion.
- Remain correct under rapid repeated submissions and duplicate backend requests.
- Avoid animating the initial list load as if all existing rows were newly added.
- Preserve iOS Reduce Motion behavior.

## Non-goals

- Redesigning shopping-list rows, category sections, the completion grace period, or drag-and-drop behavior.
- Changing shopping-list sorting or category semantics.
- Adding new user-visible strings.
- Migrating the entire app to another animation library.

## Approach

### 1. Give newly created items a stable, idempotent identity

1. Extend `ShoppingListItemInput` with a client-generated UUID used as the persisted item ID or as an equally stable creation key returned by every API representation.
2. Generate the UUID once before the optimistic cache item is created. Do not generate keys during rendering.
3. Send the UUID with `POST /api/shopping-list` and have the API create the row with that ID.
4. Make repeated submissions of the same UUID idempotent within the active household:
   - Return the existing item when the UUID, household, creator, text, and category match.
   - Reject a conflicting reuse of the UUID rather than silently changing the existing item.
   - Do not create a second row for a replayed request.
5. Use the same UUID for the optimistic cache object, the POST response, SSE snapshots, later edits, reorders, toggles, and deletes. Remove the `temp-*` to server-ID replacement map once no callsite depends on it.
6. Preserve the current FIFO write behavior for rapid additions. Verify that a rapid sequence of distinct submissions receives distinct UUIDs and remains ordered.

### 2. Make row keys describe logical identity only

1. Change `shoppingListRowKey` so both incomplete and completed rows use the same `item-{id}` key.
2. Keep section and add-row keys category-specific and unchanged.
3. Update `hasSameRowOrder` and drag reconciliation to use the same stable key helper without treating completion-state changes as replacement items.
4. Verify that completion moves the existing row rather than unmounting it, including when completed items remain visible only during the 10-second grace period.

### 3. Establish one animation owner per behavior

1. Remove the unconditional nested `FadeInDown`/`FadeOut` wrapper from every shopping item.
2. Use a subtle opacity-only entry animation for genuinely new rows. Target 150–180 ms; do not translate the row from the bottom.
3. Use a matching opacity-only exit animation for genuine removals, including swipe delete and expiration of the completion grace period.
4. Attach entry/exit motion at the draggable cell boundary, or patch the local cell integration so the outer list cell waits for its own exit. Do not rely on a nested child exit beneath a cell that is being removed.
5. Prevent entry animation during initial list hydration. Track whether the first loaded snapshot has rendered and animate only IDs first observed after that point.
6. Hoist or memoize animation builders instead of recreating them inside `renderItem`.
7. Continue disabling nonessential motion when `useReducedMotion()` is true.

### 4. Animate survivor-row reflow as one layout transaction

1. Do not merely add `enableLayoutAnimationExperimental` to the current draggable list.
2. First implement the reflow using an update-only React Native `LayoutAnimation` transaction scheduled immediately before the optimistic cache change for:
   - add;
   - complete and uncomplete;
   - swipe delete;
   - completion grace-period removal;
   - Clear completed;
   - category collapse and expansion if the same transition can be reused without affecting drag.
3. Limit the layout transaction to position/size updates. Entry and exit opacity remain owned by the row animation from the prior section so two systems do not animate the same property.
4. Keep layout animation disabled while a drag is active and during drag correction frames.
5. Ensure the conditional Clear completed control and surviving list cells move in the same transaction when the last completed item disappears.
6. If `LayoutAnimation` is unreliable with the current draggable wrapper on either supported platform, stop and choose one of these alternatives based on a focused device spike:
   - patch `react-native-draggable-flatlist` locally for Reanimated 4 so its outer cell accepts a current `layout` builder without the legacy `LayoutAnimationRepository` path; or
   - migrate the shopping screen to a maintained Reanimated 4-compatible reorderable list.
7. Do not combine the legacy experimental path, React Native `LayoutAnimation`, and nested Reanimated layout transitions in production.

### 5. Guard repeated actions and rollback paths

1. Keep distinct rapid add submissions supported; use one stable UUID per accepted submit.
2. Prevent the same input submit event from enqueueing the same UUID more than once before the input state clears.
3. Keep Clear completed backend-safe when called repeatedly. Disable or ignore a second UI clear while the first mutation is pending even though the endpoint remains idempotent.
4. On an add failure, remove the optimistic row using one exit animation and do not reuse its UUID for a later user submission.
5. On a toggle, delete, or clear failure, restore the previous cache snapshot using one coordinated layout transaction. Do not replay an entry animation on every unchanged restored row.
6. Ensure SSE snapshots received after writes settle preserve stable IDs and do not retrigger entry animations for already-known items.

## Critical files and anchors

- `apps/mobile/src/screens/ShoppingListScreen/index.tsx` — stable row keys, action-specific animation state, draggable-list integration, and layout transaction scheduling.
- `apps/mobile/src/screens/ShoppingListScreen/helpers.ts` — row identity and row-order helpers.
- `apps/mobile/src/screens/ShoppingListScreen/AddItemRow.tsx` — repeated-submit guard and stable creation request handoff.
- `packages/shared/src/types.ts` — stable client creation ID in the shopping-list input contract.
- `packages/shared/src/hooks/useShoppingList.ts` — optimistic creation, known-item tracking, rollback behavior, removal of temporary-ID replacement, and repeated-write handling.
- `packages/shared/src/api/client.ts` — updated add payload.
- `services/api/src/api/models.py` — validated client-supplied shopping item ID.
- `services/api/src/api/routes/shopping_list.py` — idempotent scoped creation behavior.
- `services/api/tests/test_shopping_list.py` — creation replay/conflict coverage.
- `apps/mobile/node_modules/react-native-draggable-flatlist/src/components/CellRendererComponent.tsx` — reference for the installed experimental gating only; do not edit `node_modules` directly.

## Verification

### Automated checks

1. Add API tests covering:
   - first creation with a client UUID;
   - an identical replay returning the existing row without creating a duplicate;
   - a conflicting replay returning an error;
   - reuse from another household/user not exposing or mutating the original row.
2. Add shared-hook tests, or extract pure reconciliation helpers and test:
   - the optimistic and confirmed object retain one ID;
   - an SSE snapshot of a confirmed optimistic item is recognized as already known;
   - rollback removes or restores only the affected items;
   - rapid distinct adds remain ordered.
3. Add mobile helper tests proving incomplete and completed representations of the same item return the same key.
4. Run from the repository root:
   - `uv run --directory services/api pytest tests/test_shopping_list.py`
   - `pnpm --filter mobile exec tsc --noEmit`
   - the repository's shared-package typecheck/test command discovered from `packages/shared/package.json`.

### Device checks

Test a release-like iOS build with the network in normal and throttled conditions:

1. Open an existing non-empty shopping list and verify existing rows do not animate on initial load.
2. Add one item and verify it fades in once; after the server response arrives, it must not move, flash, fade, or remount.
3. Press Return rapidly to add several distinct items. Verify each appears once, maintains submission order, and does not steal or lose input focus.
4. Complete and uncomplete an item. Verify one existing row moves between positions while the check-circle feedback remains intact; there must be no old/new crossfade pair.
5. Complete an item with Show completed disabled, wait for the grace period, and verify one fade-out plus one smooth survivor reflow.
6. Swipe-delete an item and verify the same behavior.
7. Clear one completed item and then many completed items across categories. Verify all removals form one coordinated transaction, the Clear completed control disappears smoothly, and surviving section/add rows do not snap.
8. Trigger add, complete, delete, and clear failures using a disconnected API. Verify rollback is smooth and no unchanged row replays its entry animation.
9. Start dragging immediately after an add settles and verify lift, reorder, drop, and drag correction remain unchanged.
10. Enable iOS Reduce Motion and repeat the scenarios. Verify state and layout remain correct without entry/exit motion.
11. Run the core scenarios on Android if it remains a supported release platform, with special attention to `LayoutAnimation` enablement and drag interaction.

## Acceptance criteria

- A logical shopping item has one stable React/list key for its entire lifetime.
- Adding an item produces at most one visible entry animation.
- Server confirmation and SSE reconciliation produce no animation for an already-visible item.
- Completing and uncompleting move the existing row without an exit/entry replacement pair.
- Clear completed removes all affected rows and reflows survivors in one smooth transaction.
- Initial list load does not animate every row.
- Rapid repeated actions remain correct and do not create conflicting or duplicate backend work.
- Dragging, swipe deletion, editing, presence locks, category ordering, haptics, and completion grace behavior remain intact.
- Reduce Motion disables nonessential entry/exit motion.
- No production path depends on `react-native-draggable-flatlist`'s legacy experimental layout repository.

## Research references

- [React: Rendering Lists — stable key rules](https://react.dev/learn/rendering-lists#rules-of-keys)
- [React Native: LayoutAnimation](https://reactnative.dev/docs/layoutanimation)
- [React Native Reanimated: Entering/Exiting animations](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations/)
- [React Native Reanimated: List Layout Animations](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/list-layout-animations/)
- [`react-native-draggable-flatlist` API](https://github.com/computerjazz/react-native-draggable-flatlist#api)

## Plan lifecycle

Keep this file in `docs/specs/` while implementation is pending or in progress. Move it to `docs/specs/completed/` only after the acceptance criteria and device checks have been completed and the user confirms the implementation is fully complete and correct.
