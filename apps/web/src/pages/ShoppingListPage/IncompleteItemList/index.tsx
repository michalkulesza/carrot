import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { PresenceUser, ShoppingListItem } from '@carrot/shared/types'
import SortableItemRow from '../SortableItemRow'

interface IncompleteItemListProps {
  items: ShoppingListItem[]
  presence: PresenceUser[]
  currentUserId?: string
  onDragEnd: (event: DragEndEvent) => void
  onToggle: (item: ShoppingListItem) => void
  onEditText: (item: ShoppingListItem, text: string) => void
  onEditStart: (item: ShoppingListItem) => void
  onEditEnd: () => void
  onDelete: (item: ShoppingListItem) => void
}

const IncompleteItemList = ({
  items,
  presence,
  currentUserId,
  onDragEnd,
  onToggle,
  onEditText,
  onEditStart,
  onEditEnd,
  onDelete,
}: IncompleteItemListProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const findEditorForItem = (itemId: string): PresenceUser | undefined =>
    presence.find((user) => user.item_id === itemId && user.user_id !== currentUserId)

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => {
          const editor = findEditorForItem(item.id)

          return (
            <SortableItemRow
              key={item.id}
              item={item}
              locked={Boolean(editor)}
              editor={editor}
              onToggle={() => onToggle(item)}
              onEditText={(text) => onEditText(item, text)}
              onEditStart={() => onEditStart(item)}
              onEditEnd={onEditEnd}
              onDelete={() => onDelete(item)}
            />
          )
        })}
      </SortableContext>
    </DndContext>
  )
}

export default IncompleteItemList
