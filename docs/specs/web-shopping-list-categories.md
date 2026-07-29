# Web Shopping List Categories

Status: pending

## Goal

Bring the web shopping list to category parity with the iOS experience: show the user's enabled shopping categories in their saved order, add items directly to a category, move active items within and between categories, fold disabled-category items into Other, and honor the completed-item preference. Add web settings for enabling and ordering categories without changing the already-shipped API, persistence, Gemini categorization, or recipe-to-shopping-list flow.

## Current state

- The backend and shared package already persist the six stable category IDs (`produce`, `pantry`, `dairy_eggs`, `meat_seafood`, `frozen`, `other`), validate ordered per-user category preferences, and accept complete `category_orders` reorder payloads.
- `useShoppingList` already performs category-aware optimistic adds, toggles, and reorders and serializes shopping-list writes.
- Web recipe additions already pass each ingredient's `shopping_list_category`, falling back to `other`; that path needs regression verification, not a redesign.
- `ShoppingListPage.tsx` still renders one flat active list, always adds manual items to `other`, groups all completed items at the bottom, and rebuilds reorder payloads from that flat list.
- Web settings do not expose `shopping_categories` or `show_completed_shopping_items`.
- The shared `normalizeShoppingCategories` helper and mobile `visibleShoppingCategories` helper currently restore catalog order instead of preserving the user's saved order. Fixing this is required before both clients can accurately render category reordering.

## Product behavior

1. Render every enabled category, including empty categories, in `preferences.shopping_categories` order. `other` is always present.
2. Each category is a disclosure section with a localized heading, active rows, a category-local add row, and any visible completed rows. Collapsing a section hides all of its rows and its add control.
3. Persist disclosure state in `localStorage`, scoped by user and active household (`personal` for the personal list), so accounts and list scopes do not leak UI state into one another.
4. An item whose stored category is disabled appears in the Other section without changing its persisted category. Re-enabling the category returns it to that section.
5. Active items can be reordered within a category and dragged to another expanded category, including an empty one. A drop into a non-Other category persists that destination category. A disabled-category item merely reordered inside virtual Other retains its stored category; an item explicitly moved from an enabled category into Other becomes `other`.
6. Manual adds submit `{ text, category }` for the containing section. Each row blocks duplicate submits while its request is pending, clears only after the mutation is accepted, remains keyboard accessible, and surfaces a localized error toast on failure.
7. When `show_completed_shopping_items` is on, completed rows remain below the add row in their category. When it is off, a newly completed row remains visible there for 10 seconds and then leaves; unchecking it during the grace period cancels the timer and restores it immediately.
8. Clear completed remains a single global, confirmation-protected action covering every category. Existing editing presence, soft locks, deletion, keyboard sorting, optimistic updates, SSE reconciliation, and recipe-to-list category assignment remain intact.
9. Web Settings gets a Shopping List card containing the Show completed switch and all six category rows. Users can enable/disable and reorder categories; Other stays enabled and cannot be disabled. Rapid toggles and reorders are queued in action order, and a failed write rolls back to the last server-confirmed preference set with a localized toast.

## Implementation plan

### 1. Correct and centralize category ordering

1. Change `normalizeShoppingCategories` in `packages/shared/src/types.ts` to de-duplicate valid incoming IDs while preserving their supplied order, append `other` only when absent, and use the full default catalog only when no preference value exists.
2. Update `apps/mobile/src/screens/ShoppingListScreen/helpers.ts` to call the shared normalizer instead of filtering through `DEFAULT_SHOPPING_CATEGORIES`. This is a parity correctness fix: category order selected in iOS settings must actually control the iOS list as well as the new web list.
3. Add pure web helpers for:
   - resolving enabled category order;
   - mapping disabled stored categories to the displayed Other section;
   - grouping/sorting active and visible completed items;
   - applying same-category and cross-category drag results;
   - building a complete `ShoppingCategoryOrders` payload in which every active item ID appears exactly once;
   - retaining disabled source IDs when a row stays in virtual Other.

### 2. Replace the flat web page with category sections

1. Convert `apps/web/src/pages/ShoppingListPage.tsx` into `apps/web/src/pages/ShoppingListPage/index.tsx` and extract focused sibling components such as `CategorySection.tsx`, `ShoppingItemRow.tsx`, `AddItemRow.tsx`, `PresenceBar.tsx`, and `ClearCompletedModal.tsx`. Preserve the folder import used by `AppShell` while bringing the page orchestration below the project's file-size guideline.
2. Read `preferences` with `usePreferences`, the current list scope with `useHousehold`, and the current user with `useAuth`. Derive sections from the shared shopping-list snapshot rather than duplicating item data in component state.
3. Render all enabled sections as semantic disclosure controls with `aria-expanded`, translated names, clear focus states, and a stable category-local empty/add target. Use CSS transitions that honor `prefers-reduced-motion`.
4. Move the add form into each expanded category. Give each form an in-flight guard and preserve the existing Enter-driven workflow and focus behavior. Submit the section's category instead of hardcoding `other`.
5. Keep completed rows in their displayed category and implement the 10-second grace map/timers. Clear timers on uncheck, clear-completed, scope change, and unmount so stale timers cannot affect a new household.
6. Keep the global Clear completed affordance above the sections whenever completed items exist. Use the established HeroUI confirmation-modal pattern, disable repeated confirmation while the mutation is pending, and report failure without dismissing recoverable state.
7. Preserve presence display and soft locking. Exclude the current user from the presence bar and from lock resolution, stop presence on submit/cancel/unmount, hide destructive/drag controls for locked rows, and keep Escape-to-cancel editing behavior.
8. Add per-item mutation guards for toggle/delete/edit so rapid repeated clicks cannot enqueue contradictory operations. Let the existing shared optimistic rollback and write queue remain the source of data reconciliation; show localized error feedback at the page boundary.

### 3. Make drag-and-drop category aware

1. Keep one `DndContext` with the existing pointer and keyboard sensors, but give every expanded category a droppable body and its own `SortableContext`. Empty categories must still accept a drop through the body/add-row target.
2. Maintain only a temporary drag projection while dragging so rows can move visibly across containers. Cancel restores the server-derived section state; a successful drop derives one complete active-item payload and calls `reorder` once.
3. Resolve destination behavior explicitly:
   - reorder in the same stored category: update only category-local positions;
   - move to an expanded non-Other category: assign that category;
   - move an enabled-category item to Other: assign `other`;
   - reorder an already-folded disabled-category item within Other: retain its stored category;
   - reject/cancel drops on collapsed sections, completed rows, locked rows, or outside a valid category body.
4. Keep the drag handle hover-revealed for pointer users, expose translated keyboard instructions/labels, and disable a second drag while a reorder mutation is pending. On API rejection, discard the projection, rely on optimistic rollback, and show a localized error toast.

### 4. Add web shopping-list settings

1. Add `apps/web/src/pages/SettingsPage/ShoppingListSettingsSection.tsx` and render it from `SettingsPage/index.tsx` near the general Preferences section.
2. Put the completed-item switch at the top and a sortable list of all six translated categories below it. Enabled categories appear in their saved order; disabled categories remain visible so they can be restored. Other is visibly enabled and its switch is disabled.
3. Use `@dnd-kit/sortable` for category ordering with pointer and keyboard support. Only enabled IDs are sent in `shopping_categories`, always including `other`; disabled rows may be displayed after enabled rows but are excluded from the persisted array.
4. Own an optimistic local preference draft plus a serialized write queue, mirroring the iOS rapid-action guarantee. Each write sends the complete relevant preference value, updates the settings-page preference callback/React Query cache with the response, and rolls back to the last confirmed value only if the latest outstanding action fails.
5. Disable or guard repeated Show completed toggles while their current write is unresolved, and show success only through immediate state change; failures use a localized toast and restore the confirmed value.

### 5. Translations and cleanup

1. Reuse the existing category names and settings descriptions where possible.
2. Add any web-only labels and errors—collapse/expand, drag/reorder, clear confirmation, and add/update/reorder failures—to `packages/shared/src/locales/en.json`, `pl.json`, `de.json`, `fr.json`, and `es.json`.
3. Remove the flat-list-only `CompletedSection`, hardcoded `Drag to reorder` label, global add row, obsolete imports, and old category-order reduction. Do not retain a compatibility rendering path.
4. No backend schema, route, migration, Gemini, or recipe modal changes are expected. Touch those areas only if verification exposes a contract mismatch.

## Critical files

- `packages/shared/src/types.ts` — preserve saved category order in normalization.
- `apps/mobile/src/screens/ShoppingListScreen/helpers.ts` — consume the corrected shared ordering behavior.
- `apps/web/src/pages/ShoppingListPage/` — category grouping, disclosure state, completion grace, editing/presence, and cross-category drag orchestration.
- `apps/web/src/pages/SettingsPage/ShoppingListSettingsSection.tsx` — web category configuration and completed-item preference.
- `apps/web/src/pages/SettingsPage/index.tsx` — mount the new settings section and keep preference state synchronized.
- `packages/shared/src/locales/{en,pl,de,fr,es}.json` — localized accessibility, confirmation, and failure strings.

## Verification

1. Add focused unit tests for the pure category helpers. Cover saved-order preservation, forced Other, disabled-category folding, empty categories, completion visibility/grace inputs, within-category reorder, cross-category moves, virtual-Other preservation, and the complete/no-duplicates reorder invariant. If the web package has no test runner at implementation time, add Vitest and a scoped `test` script rather than leaving the transforms untested.
2. Run:
   - `pnpm --filter @carrot/shared typecheck`
   - `pnpm --filter mobile exec tsc --noEmit`
   - `pnpm --filter web exec eslint src`
   - `pnpm --filter web build`
   - the new scoped web unit-test command
3. In the web app, verify both Personal and a household list:
   - configure a non-default category order, disable Pantry, refresh, and confirm the order persists and Pantry items appear under Other without changing stored category;
   - re-enable Pantry and confirm those items return to Pantry in the configured order;
   - add items in empty and populated sections, rapidly press Enter/click controls, and confirm no duplicates or contradictory toggles are produced;
   - reorder within a category, move an item across categories, drop into an empty category, cancel a drag, and confirm another open client reconciles through SSE;
   - collapse sections, switch household/personal scope, refresh, and confirm disclosure state is isolated per user and scope;
   - test completed items with the preference both on and off, including unchecking during the 10-second grace period and clearing all completed items through confirmation;
   - edit an item from a second client and confirm the presence badge, edit/delete/drag lock, Escape cancellation, and server reconciliation still work;
   - add one and all recipe ingredients and confirm their existing extracted categories are retained.
4. Repeat keyboard-only navigation for disclosures, add forms, item controls, category settings, and sortable lists; verify focus visibility and screen-reader labels. Repeat with reduced motion enabled.

## Delivery

- Keep this plan in `docs/specs/` while work is pending or in progress.
- After implementation and verification, ask the user to confirm the change is fully complete and correct before committing.
- Include this plan in the implementation commit, then move it to `docs/specs/completed/` only after the implementation is fully complete.

## Assumptions

- “Like iOS” includes both list behavior and the personal category/completed-item settings, adapted to the existing desktop web settings layout rather than adding a new route.
- The six-category catalog and current API payloads remain authoritative; category display names never cross storage or API boundaries.
- Category collapse remains device-local UI state. Category enablement/order and completed-item visibility remain server-backed personal preferences.
