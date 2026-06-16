import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_async_session
from api.models import (
    ShoppingListItem,
    ShoppingListItemOut,
    ShoppingListItemUpdate,
    ShoppingListItemsCreate,
    ShoppingListReorderRequest,
)
from api.routes.context import get_active_household_id
from api.users import User, current_active_user

router = APIRouter(prefix="/shopping-list", tags=["shopping-list"])


def _scope_filter(user_id: uuid.UUID, household_id: uuid.UUID | None):
    if household_id is not None:
        return ShoppingListItem.household_id == household_id
    return and_(
        ShoppingListItem.user_id == user_id,
        ShoppingListItem.household_id.is_(None),
    )


@router.get("", response_model=list[ShoppingListItemOut])
async def list_items(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> list[ShoppingListItemOut]:
    result = await session.execute(
        select(ShoppingListItem)
        .where(_scope_filter(user.id, household_id))
        .order_by(ShoppingListItem.completed.asc(), ShoppingListItem.position.asc())
    )
    return [ShoppingListItemOut.model_validate(i) for i in result.scalars().all()]


@router.post("", response_model=list[ShoppingListItemOut], status_code=201)
async def add_items(
    body: ShoppingListItemsCreate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> list[ShoppingListItemOut]:
    max_pos_result = await session.execute(
        select(func.max(ShoppingListItem.position))
        .where(_scope_filter(user.id, household_id))
        .where(ShoppingListItem.completed.is_(False))
    )
    max_pos = max_pos_result.scalar() or -1

    new_items = []
    for i, text in enumerate(body.items):
        text = text.strip()
        if not text:
            continue
        item = ShoppingListItem(
            user_id=user.id,
            household_id=household_id,
            text=text,
            completed=False,
            position=max_pos + 1 + i,
        )
        session.add(item)
        new_items.append(item)

    await session.commit()
    for item in new_items:
        await session.refresh(item)
    return [ShoppingListItemOut.model_validate(i) for i in new_items]


# NOTE: /order must be defined before /{item_id} so FastAPI matches it first
@router.patch("/order", status_code=200)
async def reorder_items(
    body: ShoppingListReorderRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> dict:
    result = await session.execute(
        select(ShoppingListItem)
        .where(_scope_filter(user.id, household_id))
        .where(ShoppingListItem.id.in_(body.ids))
        .where(ShoppingListItem.completed.is_(False))
    )
    items_by_id = {i.id: i for i in result.scalars().all()}
    for pos, item_id in enumerate(body.ids):
        if item_id in items_by_id:
            items_by_id[item_id].position = pos
    await session.commit()
    return {}


@router.patch("/{item_id}", response_model=ShoppingListItemOut)
async def update_item(
    item_id: uuid.UUID,
    body: ShoppingListItemUpdate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> ShoppingListItemOut:
    result = await session.execute(
        select(ShoppingListItem)
        .where(_scope_filter(user.id, household_id))
        .where(ShoppingListItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    if body.text is not None:
        item.text = body.text.strip()

    if body.completed is not None and body.completed != item.completed:
        item.completed = body.completed
        # Move to end of the relevant section
        max_pos_result = await session.execute(
            select(func.max(ShoppingListItem.position))
            .where(_scope_filter(user.id, household_id))
            .where(ShoppingListItem.completed.is_(body.completed))
            .where(ShoppingListItem.id != item_id)
        )
        max_pos = max_pos_result.scalar() or -1
        item.position = max_pos + 1

    item.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(item)
    return ShoppingListItemOut.model_validate(item)


# NOTE: /completed must be defined before /{item_id}
@router.delete("/completed", status_code=204)
async def clear_completed(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> None:
    result = await session.execute(
        select(ShoppingListItem)
        .where(_scope_filter(user.id, household_id))
        .where(ShoppingListItem.completed.is_(True))
    )
    for item in result.scalars().all():
        await session.delete(item)
    await session.commit()


@router.delete("/{item_id}", status_code=204)
async def delete_item(
    item_id: uuid.UUID,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
    household_id: uuid.UUID | None = Depends(get_active_household_id),
) -> None:
    result = await session.execute(
        select(ShoppingListItem)
        .where(_scope_filter(user.id, household_id))
        .where(ShoppingListItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    await session.delete(item)
    await session.commit()
