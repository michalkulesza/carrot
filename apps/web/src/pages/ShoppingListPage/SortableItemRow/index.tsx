import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Edit2, Trash2 } from 'react-feather'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PresenceUser, ShoppingListItem } from '@carrot/shared/types'
import { AISLE_STYLES } from '../aisles'
import { GripIcon, LockIcon } from '../Icons'
import { useItemDisplay } from '../ShoppingItemPreview'

const TOOLBAR_HOVER_DELAY_MS = 600

interface ShoppingItemRowProps {
  item: ShoppingListItem
  locked: boolean
  editor?: PresenceUser
  sortable: boolean
  onToggle: () => void
  onEditText: (text: string) => void
  onEditStart: () => void
  onEditEnd: () => void
  onDelete: () => void
}

const ShoppingItemRow = ({
  item,
  locked,
  editor,
  sortable,
  onToggle,
  onEditText,
  onEditStart,
  onEditEnd,
  onDelete,
}: ShoppingItemRowProps) => {
  const { t } = useTranslation()
  const style = AISLE_STYLES[item.category]
  const done = item.completed
  const { displayText, amount, name } = useItemDisplay(item)
  const [toolsVisible, setToolsVisible] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !sortable })

  const clearHoverTimer = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }

  // The toolbar only appears after the pointer has rested on the row, so it
  // does not flash while moving across the list.
  const handleHoverStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    clearHoverTimer()
    hoverTimer.current = setTimeout(
      () => setToolsVisible(true),
      TOOLBAR_HOVER_DELAY_MS
    )
  }

  const handleHoverEnd = () => {
    clearHoverTimer()
    setToolsVisible(false)
  }

  useEffect(() => clearHoverTimer, [])

  const handleEditStart = () => {
    if (locked) return

    setDraft(item.text)
    setIsEditing(true)
    onEditStart()
  }

  const handleEditEnd = () => {
    const trimmedText = draft.trim()
    if (trimmedText && trimmedText !== item.text) onEditText(trimmedText)

    setIsEditing(false)
    onEditEnd()
  }

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      setIsEditing(false)
      onEditEnd()
    }
  }

  return (
    <div
      ref={setNodeRef}
      onPointerEnter={handleHoverStart}
      onPointerLeave={handleHoverEnd}
      style={{
        transform: isDragging ? undefined : CSS.Translate.toString(transform),
        transition,
      }}
      className={`group relative flex items-center gap-3 border-b border-[#F4F3F7] -mx-3 px-3.5 py-3 last:border-b-0 hover:bg-[#FBFAFC] md:py-2 ${
        done ? 'opacity-75' : ''
      } ${isDragging ? 'opacity-0' : ''}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={displayText}
        onClick={onToggle}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 md:h-5 md:w-5"
        style={{
          borderColor: style.dot,
          background: done ? style.dot : '#fff',
        }}
      >
        {done && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 5 5 9-10" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            type="text"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={handleEditEnd}
            onKeyDown={handleDraftKeyDown}
            className="w-full border-b border-primary bg-transparent text-base focus:outline-none md:text-[15px]"
          />
        ) : (
          <button
            type="button"
            onClick={locked ? undefined : onToggle}
            className={`w-full text-left text-base md:text-[15px] ${
              done ? 'text-[#A9A6B4] line-through' : 'text-[#1F1D2B]'
            }`}
          >
            {amount && (
              <b
                className={`font-extrabold ${done ? 'text-[#A9A6B4]' : 'text-[#1F1D2B]'}`}
              >
                {amount}{' '}
              </b>
            )}
            {name}
            {locked && editor && (
              <span className="mt-0.5 flex items-center gap-1 no-underline">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: editor.color }}
                />
                <span className="text-[11px] text-zinc-400">
                  {t('shoppingList.presenceEditing', { name: editor.nickname })}
                </span>
              </span>
            )}
          </button>
        )}
      </div>

      {!isEditing && (
        <div
          className={`absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-[#E4E1EA] bg-white px-1 py-0.5 shadow-[0_2px_8px_rgba(31,29,43,0.1)] transition-opacity duration-150 focus-within:pointer-events-auto focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 ${
            toolsVisible
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0'
          }`}
        >
          {!done && !locked && (
            <button
              type="button"
              onClick={handleEditStart}
              aria-label={t('shoppingList.editItem')}
              className="flex h-7 w-7 items-center justify-center rounded text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            >
              <Edit2 size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label={t('common.delete')}
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-300 transition-colors hover:bg-danger-50 hover:text-danger"
          >
            <Trash2 size={13} />
          </button>
          {sortable &&
            (locked ? (
              <div className="flex h-7 w-7 items-center justify-center text-zinc-300">
                <LockIcon />
              </div>
            ) : (
              <button
                type="button"
                {...attributes}
                {...listeners}
                aria-label={t('recipes.dragToReorder')}
                className="flex h-7 w-7 cursor-grab items-center justify-center rounded text-zinc-300 transition-colors hover:text-zinc-500 active:cursor-grabbing"
              >
                <GripIcon />
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

export default ShoppingItemRow
