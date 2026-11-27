import uuid
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Protocol


class OrderableItem(Protocol):
    id: uuid.UUID
    completed: bool
    position: int
    created_at: object
    restore_before_id: uuid.UUID | None


def _created_at_key(value: object) -> object:
    if isinstance(value, datetime) and value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


# Must match the client's compareShoppingItems: created_at as a UTC instant, then the lowercase id string.
def _sort_key(item: OrderableItem) -> tuple:
    return (item.position, _created_at_key(item.created_at), str(item.id).lower())


def _unticked_in_order(items: Iterable[OrderableItem]) -> list:
    return sorted((i for i in items if not i.completed), key=_sort_key)


def _next_position(items: Iterable[OrderableItem]) -> int:
    positions = [i.position for i in items]
    return max(positions) + 1 if positions else 0


def tick_item(item: OrderableItem, category_items: Iterable[OrderableItem]) -> None:
    others = [i for i in category_items if i.id != item.id]
    unticked = _unticked_in_order([*others, item])
    following = unticked[unticked.index(item) + 1 :]

    item.restore_before_id = following[0].id if following else None
    item.completed = True
    item.position = _next_position(i for i in others if i.completed)


def _resolve_anchor(item: OrderableItem, by_id: dict) -> OrderableItem | None:
    visited = {item.id}
    anchor_id = item.restore_before_id
    while anchor_id is not None and anchor_id not in visited:
        anchor = by_id.get(anchor_id)
        if anchor is None:
            return None
        if not anchor.completed:
            return anchor
        visited.add(anchor_id)
        anchor_id = anchor.restore_before_id
    return None


def untick_item(item: OrderableItem, category_items: Iterable[OrderableItem]) -> None:
    others = [i for i in category_items if i.id != item.id]
    anchor = _resolve_anchor(item, {i.id: i for i in others})

    ordered = _unticked_in_order(others)
    insert_at = ordered.index(anchor) if anchor is not None else len(ordered)
    ordered.insert(insert_at, item)

    item.completed = False
    item.restore_before_id = None
    for position, row in enumerate(ordered):
        row.position = position
