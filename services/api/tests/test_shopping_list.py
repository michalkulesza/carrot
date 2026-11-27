import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from pydantic import ValidationError

from api.routes import shopping_list as shopping_list_routes
from api.shopping_list_order import _sort_key, tick_item, untick_item
from api.models import (
    SaveComponent,
    ShoppingCategory,
    ShoppingListItemUpdate,
    ShoppingListItemsCreate,
    ShoppingListReorderRequest,
    UserPreferencesUpdate,
)


def test_shopping_list_items_require_known_categories() -> None:
    item_id = uuid.uuid4()
    request = ShoppingListItemsCreate.model_validate({
        "items": [{"id": str(item_id), "text": "Apples", "category": "produce"}],
    })

    assert request.items[0].id == item_id
    assert request.items[0].category is ShoppingCategory.PRODUCE

    with pytest.raises(ValidationError):
        ShoppingListItemsCreate.model_validate({
            "items": [{"id": str(item_id), "text": "Apples", "category": "fruit"}],
        })

    with pytest.raises(ValidationError, match="unique"):
        ShoppingListItemsCreate.model_validate({
            "items": [
                {"id": str(item_id), "text": "Apples", "category": "produce"},
                {"id": str(item_id), "text": "Pears", "category": "produce"},
            ],
        })


def test_preference_categories_deduplicate_and_retain_other() -> None:
    update = UserPreferencesUpdate.model_validate({
        "shopping_categories": ["produce", "produce", "pantry"],
    })

    assert update.shopping_categories == [
        ShoppingCategory.PRODUCE,
        ShoppingCategory.PANTRY,
        ShoppingCategory.OTHER,
    ]


def test_recipe_component_categories_align_with_ingredients() -> None:
    component = SaveComponent.model_validate({
        "name": "Main",
        "yield_note": "",
        "ingredients": ["1 onion"],
        "steps": [],
    })

    assert component.shopping_list_categories == [ShoppingCategory.OTHER]

    with pytest.raises(ValidationError, match="align"):
        SaveComponent.model_validate({
            "name": "Main",
            "yield_note": "",
            "ingredients": ["1 onion", "1 carrot"],
            "shopping_list_categories": ["produce"],
            "steps": [],
        })


def test_reorder_payload_groups_ids_by_category() -> None:
    item_id = uuid.uuid4()
    request = ShoppingListReorderRequest.model_validate({
        "category_orders": {"produce": [str(item_id)]},
    })

    assert request.category_orders == {ShoppingCategory.PRODUCE: [item_id]}


def _row(text: str, position: int, completed: bool = False, category: str = "produce"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        text=text,
        category=category,
        completed=completed,
        position=position,
        restore_before_id=None,
        created_at=position,
    )


def _list(*names: str) -> dict:
    return {name: _row(name, position) for position, name in enumerate(names)}


def _unticked(rows: dict) -> list[str]:
    ordered = sorted((r for r in rows.values() if not r.completed), key=lambda r: r.position)
    return [r.text for r in ordered]


def test_untick_restores_item_before_its_anchor_after_reorder() -> None:
    rows = _list("a", "b", "c", "d")
    tick_item(rows["b"], rows.values())
    assert rows["b"].restore_before_id == rows["c"].id

    rows["d"].position, rows["c"].position = 1, 2
    rows["a"].position = 0
    assert _unticked(rows) == ["a", "d", "c"]

    untick_item(rows["b"], rows.values())

    assert _unticked(rows) == ["a", "d", "b", "c"]
    assert [rows[n].position for n in ("a", "d", "b", "c")] == [0, 1, 2, 3]
    assert rows["b"].restore_before_id is None


def test_untick_follows_chain_of_ticked_anchors() -> None:
    rows = _list("a", "b", "c", "d")
    tick_item(rows["b"], rows.values())
    tick_item(rows["c"], rows.values())
    assert rows["c"].restore_before_id == rows["d"].id

    untick_item(rows["b"], rows.values())
    assert _unticked(rows) == ["a", "b", "d"]

    untick_item(rows["c"], rows.values())
    assert _unticked(rows) == ["a", "b", "c", "d"]


def test_untick_appends_when_item_was_last() -> None:
    rows = _list("a", "b", "c")
    tick_item(rows["c"], rows.values())
    assert rows["c"].restore_before_id is None

    untick_item(rows["c"], rows.values())

    assert _unticked(rows) == ["a", "b", "c"]


def test_untick_appends_when_anchor_was_deleted() -> None:
    rows = _list("a", "b", "c")
    tick_item(rows["a"], rows.values())
    remaining = [rows["a"], rows["c"]]
    assert rows["a"].restore_before_id == rows["b"].id

    untick_item(rows["a"], remaining)

    assert _unticked({"c": rows["c"], "a": rows["a"]}) == ["c", "a"]


def test_untick_appends_when_anchor_moved_to_another_category() -> None:
    rows = _list("a", "b", "c")
    tick_item(rows["a"], rows.values())
    rows["b"].category = "dairy_eggs"
    produce = [r for r in rows.values() if r.category == "produce"]

    untick_item(rows["a"], produce)

    assert _unticked({r.text: r for r in produce}) == ["c", "a"]


def test_untick_survives_anchor_cycle() -> None:
    rows = _list("a", "b")
    a, b = rows["a"], rows["b"]
    a.completed = b.completed = True
    a.restore_before_id, b.restore_before_id = b.id, a.id

    untick_item(a, rows.values())

    assert _unticked(rows) == ["a"]


def test_tick_position_handles_existing_position_zero() -> None:
    rows = _list("a", "b")
    done = _row("done", 0, completed=True)
    rows["done"] = done

    tick_item(rows["a"], rows.values())

    assert rows["a"].position == 1


def _item_session(item, category_items, before_lock=None):
    results = [item, category_items]

    async def execute(_statement):
        value = results.pop(0)
        if value is category_items and before_lock is not None:
            await before_lock()
        result = Mock()
        result.scalar_one_or_none.return_value = value
        result.scalars.return_value.all.return_value = value
        return result

    return SimpleNamespace(execute=execute, commit=AsyncMock(), refresh=AsyncMock())


def _patch_side_effects(monkeypatch) -> None:
    monkeypatch.setattr(shopping_list_routes.broadcaster, "publish", AsyncMock())
    monkeypatch.setattr(shopping_list_routes, "shopping_list_snapshot", AsyncMock(return_value=[]))
    monkeypatch.setattr(shopping_list_routes.broadcaster, "is_locked_by_other", lambda *_: False)
    monkeypatch.setattr(
        shopping_list_routes.ShoppingListItemOut, "model_validate", staticmethod(lambda item: item)
    )


@pytest.mark.asyncio
async def test_repeated_identical_toggle_request_is_a_no_op(monkeypatch) -> None:
    rows = _list("a", "b", "c")
    _patch_side_effects(monkeypatch)
    user = SimpleNamespace(id=uuid.uuid4())
    body = ShoppingListItemUpdate(completed=True)

    await shopping_list_routes.update_item(
        rows["b"].id, body, user, _item_session(rows["b"], list(rows.values())), uuid.uuid4()
    )
    anchor, position = rows["b"].restore_before_id, rows["b"].position
    await shopping_list_routes.update_item(
        rows["b"].id, body, user, _item_session(rows["b"], list(rows.values())), uuid.uuid4()
    )

    assert rows["b"].completed is True
    assert (rows["b"].restore_before_id, rows["b"].position) == (anchor, position)
    assert anchor == rows["c"].id


@pytest.mark.asyncio
async def test_concurrent_identical_toggles_compare_after_the_lock(monkeypatch) -> None:
    rows = _list("a", "b", "c")
    _patch_side_effects(monkeypatch)
    user = SimpleNamespace(id=uuid.uuid4())
    body = ShoppingListItemUpdate(completed=True)
    first_committed = asyncio.Event()

    first_session = _item_session(rows["b"], list(rows.values()))
    first_session.commit = AsyncMock(side_effect=first_committed.set)
    # The second request read the unticked row before the first committed, then waits on the row lock.
    second_session = _item_session(rows["b"], list(rows.values()), before_lock=first_committed.wait)

    await asyncio.gather(
        shopping_list_routes.update_item(rows["b"].id, body, user, second_session, uuid.uuid4()),
        shopping_list_routes.update_item(rows["b"].id, body, user, first_session, uuid.uuid4()),
    )

    assert rows["b"].completed is True
    assert rows["b"].restore_before_id == rows["c"].id
    assert _unticked(rows) == ["a", "c"]


@pytest.mark.asyncio
async def test_toggle_conflicts_when_item_left_its_category_before_the_lock(monkeypatch) -> None:
    rows = _list("a", "b")
    _patch_side_effects(monkeypatch)
    session = _item_session(rows["b"], [rows["a"]])

    with pytest.raises(shopping_list_routes.HTTPException) as error:
        await shopping_list_routes.update_item(
            rows["b"].id, ShoppingListItemUpdate(completed=True), SimpleNamespace(id=uuid.uuid4()), session, uuid.uuid4()
        )

    assert error.value.status_code == 409


def test_tie_break_compares_created_at_as_utc_instant_then_lowercase_id() -> None:
    later_naive = _row("later", 0)
    earlier_aware = _row("earlier", 0)
    later_naive.created_at = datetime(2026, 1, 1, 12, 0, 0)
    earlier_aware.created_at = datetime(2026, 1, 1, 13, 0, 0, tzinfo=timezone(timedelta(hours=2)))
    same_a, same_b = _row("x", 1), _row("y", 1)
    same_a.created_at = same_b.created_at = datetime(2026, 1, 1)
    same_a.id, same_b.id = uuid.UUID(int=2), uuid.UUID(int=1)

    assert sorted([later_naive, earlier_aware], key=_sort_key) == [earlier_aware, later_naive]
    assert sorted([same_a, same_b], key=_sort_key) == [same_b, same_a]
