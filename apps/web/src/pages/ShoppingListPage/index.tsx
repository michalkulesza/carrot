import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import {
  SHOPPING_CATEGORIES,
  type ShoppingCategory,
  type ShoppingCategoryOrders,
  type ShoppingListItem,
} from '@carrot/shared/types'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/AuthContext'
import { AISLE_STYLES } from './aisles'
import { AISLE_DROP_PREFIX } from './AisleCard'
import AddItemRow from './AddItemRow'
import AisleCard from './AisleCard'
import EmptyState from './EmptyState'
import ShoppingItemPreview from './ShoppingItemPreview'
import LoadingState from './LoadingState'
import PresenceBar from './PresenceBar'

const ShoppingListPage = () => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { preferences } = usePreferences()
  const {
    incompleteItems,
    completedItems,
    isLoading,
    presence,
    setEditing,
    addItems,
    toggle,
    editText,
    reorder,
    remove,
    clearCompleted,
  } = useShoppingList()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const categoryOrder = useMemo<ShoppingCategory[]>(
    () =>
      [
        ...(preferences?.shopping_categories ?? []),
        ...SHOPPING_CATEGORIES,
      ].filter((category, index, all) => all.indexOf(category) === index),
    [preferences?.shopping_categories]
  )
  const aisles = useMemo(() => {
    const items = [...incompleteItems, ...completedItems]

    return categoryOrder
      .map((category) => ({
        category,
        items: items.filter((item) => item.category === category),
      }))
      .filter((aisle) => aisle.items.length > 0)
  }, [categoryOrder, incompleteItems, completedItems])
  const openAisles = aisles.filter((aisle) =>
    aisle.items.some((item) => !item.completed)
  )
  const [showCompletedOverride, setShowCompletedOverride] = useState<
    boolean | null
  >(null)
  const showCompleted =
    showCompletedOverride ?? preferences?.show_completed_shopping_items ?? false
  const shownAisles = showCompleted ? aisles : openAisles
  const doneAisles = aisles.filter((aisle) =>
    aisle.items.every((item) => item.completed)
  )

  const handleToggle = (item: ShoppingListItem) => {
    toggle.mutate({ id: item.id, completed: item.completed })
  }

  const isAisleDrop = (id: UniqueIdentifier) =>
    String(id).startsWith(AISLE_DROP_PREFIX)

  // While an item is being dragged, `dragOrder` holds a live copy of the open
  // items per aisle. Moving the item into another aisle's list as the pointer
  // crosses it is what makes that aisle's rows shift to open a gap.
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [dragOrder, setDragOrder] = useState<Record<string, string[]> | null>(
    null
  )
  const [dragAisles, setDragAisles] = useState<ShoppingCategory[]>([])
  const activeItem = incompleteItems.find((item) => item.id === activeId)

  const findContainer = (
    id: UniqueIdentifier,
    order: Record<string, string[]>
  ): string | undefined => {
    if (isAisleDrop(id)) return String(id).slice(AISLE_DROP_PREFIX.length)

    return Object.keys(order).find((category) =>
      order[category].includes(String(id))
    )
  }

  // Prefer the row under the pointer. Over an aisle card (padding, gaps,
  // below its last row) fall back to the closest row in that card, so the
  // drop position follows the pointer.
  const collisionDetection: CollisionDetection = (args) => {
    const hits = pointerWithin(args)
    const rowHit = hits.find((hit) => !isAisleDrop(hit.id))
    if (rowHit) return [rowHit]

    const cardHit = hits.find((hit) => isAisleDrop(hit.id))
    if (cardHit && dragOrder) {
      const rowIds = new Set(
        (
          dragOrder[String(cardHit.id).slice(AISLE_DROP_PREFIX.length)] ?? []
        ).filter((id) => id !== args.active.id)
      )
      const nearest = closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) =>
          rowIds.has(String(container.id))
        ),
      })

      return nearest.length > 0 ? [nearest[0]] : [cardHit]
    }

    return closestCenter(args).slice(0, 1)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const order: Record<string, string[]> = {}
    for (const item of incompleteItems)
      (order[item.category] ??= []).push(item.id)
    setDragOrder(order)
    setDragAisles(shownAisles.map((aisle) => aisle.category))
    setActiveId(event.active.id)
  }

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragOrder) return
    const from = findContainer(active.id, dragOrder)
    const to = findContainer(over.id, dragOrder)
    if (!from || !to || from === to) return

    setDragOrder((current) => {
      if (!current) return current
      const target = current[to] ?? []
      const overIndex = target.indexOf(String(over.id))
      const dragged = active.rect.current.translated
      const below =
        dragged !== null &&
        dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2
      const insertAt =
        overIndex === -1 ? target.length : overIndex + (below ? 1 : 0)

      return {
        ...current,
        [from]: current[from].filter((id) => id !== String(active.id)),
        [to]: [
          ...target.slice(0, insertAt),
          String(active.id),
          ...target.slice(insertAt),
        ],
      }
    })
  }

  const clearDrag = () => {
    setActiveId(null)
    setDragOrder(null)
    setDragAisles([])
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const order = dragOrder
    clearDrag()
    if (!order) return

    const container = findContainer(active.id, order)
    const overContainer = over ? findContainer(over.id, order) : undefined
    const finalOrder = { ...order }
    if (
      container &&
      over &&
      overContainer === container &&
      !isAisleDrop(over.id)
    ) {
      const list = order[container]
      const oldIndex = list.indexOf(String(active.id))
      const newIndex = list.indexOf(String(over.id))
      if (oldIndex !== -1 && newIndex !== -1)
        finalOrder[container] = arrayMove(list, oldIndex, newIndex)
    }

    const original: Record<string, string[]> = {}
    for (const item of incompleteItems)
      (original[item.category] ??= []).push(item.id)
    const nonEmpty = (orders: Record<string, string[]>) =>
      Object.entries(orders).filter(([, ids]) => ids.length > 0)
    if (
      JSON.stringify(nonEmpty(finalOrder)) ===
      JSON.stringify(nonEmpty(original))
    )
      return

    const categoryOrders: ShoppingCategoryOrders = {}
    for (const [category, ids] of Object.entries(finalOrder))
      if (ids.length > 0) categoryOrders[category as ShoppingCategory] = ids
    reorder.mutate(categoryOrders)
  }

  // While dragging, aisles keep the cards they had when the drag started, and
  // the remaining aisles are appended so any of them can receive the item
  // without the existing cards moving.
  const itemsById = new Map(
    [...incompleteItems, ...completedItems].map((item) => [item.id, item])
  )
  const visibleAisles = dragOrder
    ? [
        ...dragAisles,
        ...categoryOrder.filter((category) => !dragAisles.includes(category)),
      ].map((category) => ({
        category,
        items: [
          ...(dragOrder[category] ?? []).flatMap((id) => {
            const item = itemsById.get(id)

            return item ? [{ ...item, category }] : []
          }),
          ...completedItems.filter((item) => item.category === category),
        ],
      }))
    : shownAisles

  const total = incompleteItems.length + completedItems.length
  const done = completedItems.length

  return (
    <>
      <PageHeader title={t('shoppingList.title')} />
      <div className="mx-auto max-w-[1640px] pb-[150px] font-['Nunito',system-ui,sans-serif] text-[#1F1D2B] md:pb-7">
        {isLoading ? (
          <LoadingState />
        ) : (
          <>
            <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 flex flex-col gap-2 border-b border-[#ECEAF0] bg-white px-5 pb-4 pt-3 md:static md:border-0 md:bg-transparent md:px-7 md:pb-0 md:pt-[22px]">
              <div className="flex items-baseline gap-2">
                <span className="text-[22px] font-extrabold">
                  {t('shoppingList.toGet', { count: incompleteItems.length })}
                </span>
                <span className="flex-1 text-sm font-semibold text-[#8C8A99]">
                  {t('shoppingList.inBasket', { done, total })}
                </span>
                {done > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCompletedOverride(!showCompleted)}
                    aria-pressed={showCompleted}
                    className="text-[13px] font-bold text-[#E07B39] hover:underline"
                  >
                    {showCompleted
                      ? t('shoppingList.hideCompleted')
                      : t('shoppingList.showCompleted')}
                  </button>
                )}
                {done > 0 && (
                  <button
                    type="button"
                    onClick={() => clearCompleted.mutate()}
                    disabled={clearCompleted.isPending}
                    className="text-[13px] font-bold text-[#E07B39] hover:underline disabled:opacity-50"
                  >
                    {t('shoppingList.clearCompleted')}
                  </button>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#F1EFF5]">
                <div
                  className="h-full rounded-full bg-[#E8894A] transition-[width] duration-300"
                  style={{ width: total ? `${(done / total) * 100}%` : '0%' }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 px-3.5 pt-3.5 md:gap-[18px] md:px-7 md:pt-[18px]">
              <PresenceBar users={presence} currentUserId={user?.id} />
              <AddItemRow
                categories={categoryOrder}
                onAdd={(text, category) =>
                  addItems.mutate([{ id: crypto.randomUUID(), text, category }])
                }
              />

              {!showCompleted && doneAisles.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-[#8C8A99]">
                    {t('shoppingList.doneLabel')}
                  </span>
                  {doneAisles.map(({ category }) => (
                    <span
                      key={category}
                      className="whitespace-nowrap rounded-full px-3 py-[5px] text-[13px] font-extrabold"
                      style={{
                        background: AISLE_STYLES[category].bg,
                        color: AISLE_STYLES[category].fg,
                      }}
                    >
                      ✓ {t(`shoppingList.categories.${category}`)}
                    </span>
                  ))}
                </div>
              )}

              <DndContext
                sensors={sensors}
                collisionDetection={collisionDetection}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={clearDrag}
              >
                <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] md:gap-3.5">
                  {visibleAisles.map(({ category, items }) => (
                    <AisleCard
                      key={category}
                      category={category}
                      items={items}
                      presence={presence}
                      highlight={
                        !!activeItem &&
                        activeItem.category !== category &&
                        !!dragOrder?.[category]?.includes(activeItem.id)
                      }
                      currentUserId={user?.id}
                      onToggle={handleToggle}
                      onEditText={(item, text) =>
                        editText.mutate({ id: item.id, text })
                      }
                      onEditStart={(item) => setEditing(item.id)}
                      onEditEnd={() => setEditing(null)}
                      onDelete={(item) => remove.mutate(item.id)}
                    />
                  ))}
                </div>
                <DragOverlay dropAnimation={null}>
                  {activeItem ? (
                    <ShoppingItemPreview item={activeItem} />
                  ) : null}
                </DragOverlay>
              </DndContext>

              {total === 0 && <EmptyState />}
            </div>
          </>
        )}
      </div>
    </>
  )
}

export default ShoppingListPage
