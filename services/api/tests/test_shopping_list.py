import uuid

import pytest
from pydantic import ValidationError

from api.models import (
    SaveComponent,
    ShoppingCategory,
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
