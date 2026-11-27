# Shopping list: unticking returns an item to its own place

Status: implemented, pending device verification. Scope: `services/api`, `packages/shared`, `apps/mobile` (web picks it up through the shared hook). Related: `docs/specs/mobile-shopping-list-tick-move.md` (the slide animation; it animates whatever order the data produces, so no animation work is expected here).

Read first: root `CLAUDE.md`, `~/.claude/CLAUDE.md`.

## Current behaviour

Within an aisle: unticked rows sorted by `position`, then ticked rows sorted by `position`. New items get `max + 1`. Drag rewrites positions of the unticked rows. Toggling `completed` (`services/api/src/api/routes/shopping_list.py` ~280-290, mirrored optimistically in `packages/shared/src/hooks/useShoppingList.ts` toggle `onMutate`) sets `position = max(position of the target group) + 1`, so an unticked item lands at the **end** of the unticked rows.

Drag-to-reorder stays. Ticked-group order (order of ticking) stays.

## New rule

When an item is ticked, remember **the unticked item that directly followed it** in its aisle (its "anchor"). When it is unticked, insert it **directly before its anchor**.

User's example (one aisle):

```
a b c d            tick b        -> anchor(b) = c
a c d [x]b         drag d above c
a d c [x]b         untick b      -> insert before c
a d b c
```

Ordering ties (same `position`) break the same way on server and client: `created_at` as a UTC instant (naive server timestamps are UTC), then the lowercase id string by ordinal comparison (`compareShoppingTiebreak` in `packages/shared/src/utils/shoppingListOrder.ts`, `_sort_key` in `services/api/src/api/shopping_list_order.py`).

Anchor resolution on untick (deterministic, same on server and client):

1. `anchor = item.restore_before_id`.
2. While `anchor` exists, is in the **same category**, and is **completed**: `anchor = anchor.restore_before_id` (keep a visited set; stop on a cycle). This makes chains restore correctly: `a b c d`, tick b (anchor c), tick c (anchor d), untick b → c is ticked → follow to d → `a b d`; untick c → `a b c d`.
3. If `anchor` exists, is in the same category and is unticked: insert the item directly before it.
4. Otherwise (no anchor because it was last, anchor deleted / cleared / moved to another category, cycle): append to the end of the unticked rows (today's behaviour).

Positions of the unticked rows in that category are then renumbered `0..n-1` in the resulting order, in the same transaction. Ticked group: keep `position = max(ticked) + 1` on tick.

On untick, clear `restore_before_id` (set to null). On tick, set it to the id of the next unticked item by `position` in the same category (excluding the item itself), or null if none.

Fix while there: `max_pos_result.scalar() or -1` turns a real max of `0` into `-1` (so the new position ties with an existing `0`). Use an explicit `None` check.

## Backend (`services/api`)

- `models.py` `ShoppingListItem`: add `restore_before_id: Mapped[uuid.UUID | None]` (`PG_UUID(as_uuid=True)`, nullable, **no FK**, so deleting/clearing the anchor never cascades or blocks). Add it to `ShoppingListItemOut` (`uuid.UUID | None = None`).
- Schema change goes where this project does them: the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` list in `src/api/main.py` startup (see the existing lines ~110-118). Check `worker.py` too if it runs the same bootstrap.
- `routes/shopping_list.py` update endpoint: implement tick/untick per the rule above inside the existing session/transaction. Lock or select the category's rows consistently with how the reorder endpoint does it. Duplicate requests must be safe (project rule): a repeated "completed=true" on an already-completed item is a no-op via `body.completed != item.completed`. The comparison runs after the category rows are locked (`with_for_update` + `populate_existing`), so two concurrent identical requests cannot both apply; if the item left its category before the lock the request returns 409.
- Make sure live events / household broadcasts carry the new field (check `routes/events.py` and how item payloads are serialized; other members must receive the renumbered positions of every moved row, not only the toggled item; check whether the update endpoint currently broadcasts only the single item and, if so, broadcast the affected rows or a list refresh the same way the reorder endpoint does).
- Check other places that build `ShoppingListItem` rows or payloads (showcase snapshot, backfill scripts, import worker) still work with the new nullable column.
- Tests in `services/api/tests`: the example above, the chain case, anchor deleted (Clear done), anchor moved to another category, ticked item that was last (append), max-position-0 bug, repeated identical toggle request.

## Shared (`packages/shared`)

- `types.ts` `ShoppingListItem`: add `restore_before_id: string | null`.
- Put the resolution + reorder logic in a pure helper (e.g. `packages/shared/src/shoppingListOrder.ts`, exported like neighbouring helpers) used by the toggle `onMutate` optimistic update, so the client produces the same order and positions as the server: on tick set `restore_before_id` and the ticked position; on untick resolve the anchor, insert, renumber unticked positions of that category, clear `restore_before_id`. Add unit tests if the package has a test setup (check `package.json`); otherwise skip.
- Any place that creates optimistic items (add item) sets `restore_before_id: null`.

## Mobile

- `apps/mobile/src/screens/ShoppingListScreen/useTickSequence.ts` `startUntick` / remote diff: the untick currently assumes the row goes to the end. It now gets its position from the optimistic data; make sure the `stay` pin used during the move does not override the new position after `moveThenSettle` clears it, and that the slide goes to the restored place.
- Grep the mobile and web apps for any other code that assumes "untick = end of list" (e.g. scroll-to, announcements, `helpers.ts`) and update it.
- Update `docs/specs/mobile-shopping-list-aisle-cards.md` §2.2 bullet "Un-ticking puts the item at the end of the unticked group" to point to this spec.

## Verification

- `uv run pytest` in `services/api` (at least the shopping list tests) passes.
- `npx tsc --noEmit` in `apps/mobile`, and the web app's typecheck/build script, pass.
- User verifies on device: the example above, including the slide going to the restored spot, and a second household device seeing the same order.
