import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import type { ShoppingCategoryOrders, ShoppingListItem } from '@carrot/shared/types'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../context/AuthContext'
import AddItemRow from './AddItemRow'
import CompletedSection from './CompletedSection'
import EmptyState from './EmptyState'
import IncompleteItemList from './IncompleteItemList'
import LoadingState from './LoadingState'
import PresenceBar from './PresenceBar'

const ShoppingListPage = () => {
  const { t } = useTranslation()
  const { user } = useAuth()
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

  const handleToggle = (item: ShoppingListItem) => {
    toggle.mutate({ id: item.id, completed: item.completed })
  }

  const handleEditText = (item: ShoppingListItem, text: string) => {
    editText.mutate({ id: item.id, text })
  }

  const handleEditStart = (item: ShoppingListItem) => {
    setEditing(item.id)
  }

  const handleEditEnd = () => {
    setEditing(null)
  }

  const handleDelete = (item: ShoppingListItem) => {
    remove.mutate(item.id)
  }

  const handleAdd = (text: string) => {
    addItems.mutate([{ id: crypto.randomUUID(), text, category: 'other' }])
  }

  const handleClearCompleted = () => {
    clearCompleted.mutate()
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = incompleteItems.findIndex((item) => item.id === active.id)
    const newIndex = incompleteItems.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reorderedItems = arrayMove(incompleteItems, oldIndex, newIndex)
    const categoryOrders = reorderedItems.reduce<ShoppingCategoryOrders>((orders, item) => {
      const order = orders[item.category] ?? []
      order.push(item.id)
      orders[item.category] = order

      return orders
    }, {})
    reorder.mutate(categoryOrders)
  }

  const isEmpty = incompleteItems.length === 0 && completedItems.length === 0

  return (
    <>
      <PageHeader title={t('shoppingList.title')} />
      <div className="max-w-lg mx-auto md:max-w-2xl">
        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="bg-white md:border md:border-zinc-100 md:rounded-b-xl md:shadow-sm overflow-hidden">
            <PresenceBar users={presence} currentUserId={user?.id} />

            <IncompleteItemList
              items={incompleteItems}
              presence={presence}
              currentUserId={user?.id}
              onDragEnd={handleDragEnd}
              onToggle={handleToggle}
              onEditText={handleEditText}
              onEditStart={handleEditStart}
              onEditEnd={handleEditEnd}
              onDelete={handleDelete}
            />

            <AddItemRow onAdd={handleAdd} />

            <CompletedSection
              items={completedItems}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onClear={handleClearCompleted}
            />

            {isEmpty && <EmptyState />}
          </div>
        )}
      </div>
    </>
  )
}

export default ShoppingListPage
