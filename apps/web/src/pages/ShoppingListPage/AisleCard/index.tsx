import { useTranslation } from 'react-i18next'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type {
  PresenceUser,
  ShoppingCategory,
  ShoppingListItem,
} from '@carrot/shared/types'
import { AISLE_STYLES } from '../aisles'
import SortableItemRow from '../SortableItemRow'

export const AISLE_DROP_PREFIX = 'aisle:'

interface AisleCardProps {
  category: ShoppingCategory
  items: ShoppingListItem[]
  presence: PresenceUser[]
  highlight: boolean
  currentUserId?: string
  onToggle: (item: ShoppingListItem) => void
  onEditText: (item: ShoppingListItem, text: string) => void
  onEditStart: (item: ShoppingListItem) => void
  onEditEnd: () => void
  onDelete: (item: ShoppingListItem) => void
}

const AisleCard = ({
  category,
  items,
  presence,
  highlight,
  currentUserId,
  onToggle,
  onEditText,
  onEditStart,
  onEditEnd,
  onDelete,
}: AisleCardProps) => {
  const { t } = useTranslation()
  const style = AISLE_STYLES[category]
  const open = items.filter((item) => !item.completed)
  const doneCount = items.length - open.length
  const { setNodeRef } = useDroppable({ id: `${AISLE_DROP_PREFIX}${category}` })
  const ordered = [...open, ...items.filter((item) => item.completed)]

  return (
    <section
      ref={setNodeRef}
      className="flex flex-col overflow-hidden rounded-2xl border bg-white px-3 pb-0 pt-3 transition-colors"
      style={{
        borderColor: highlight ? style.dot : '#ECEAF0',
        background: highlight ? style.bg : '#fff',
      }}
    >
      <div className="flex flex-col gap-1.5 px-1 pb-2 pt-0.5">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: style.dot }}
          />
          <h3
            className="flex-1 text-base font-extrabold md:text-[15px]"
            style={{ color: style.fg }}
          >
            {t(`shoppingList.categories.${category}`)}
          </h3>
          <span className="text-xs font-bold text-[#8C8A99]">
            {items.length === 0
              ? t('shoppingList.dropHere')
              : open.length === 0
                ? t('shoppingList.aisleAllIn')
                : t('shoppingList.aisleLeft', { count: open.length })}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[#F4F3F7]">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${items.length ? (doneCount / items.length) * 100 : 0}%`,
              background: style.dot,
            }}
          />
        </div>
      </div>
      <SortableContext
        items={open.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        {items.length === 0 && <div className="h-8" />}
        {ordered.map((item) => {
          const editor = presence.find(
            (user) => user.item_id === item.id && user.user_id !== currentUserId
          )

          return (
            <SortableItemRow
              key={item.id}
              item={item}
              sortable={!item.completed}
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
    </section>
  )
}

export default AisleCard
