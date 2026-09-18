import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'react-feather'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PresenceUser, ShoppingListItem } from '@carrot/shared/types'
import { GripIcon, LockIcon } from '../Icons'

interface SortableItemRowProps {
  item: ShoppingListItem
  locked: boolean
  editor?: PresenceUser
  onToggle: () => void
  onEditText: (text: string) => void
  onEditStart: () => void
  onEditEnd: () => void
  onDelete: () => void
}

const SortableItemRow = ({
  item,
  locked,
  editor,
  onToggle,
  onEditText,
  onEditStart,
  onEditEnd,
  onDelete,
}: SortableItemRowProps) => {
  const { t } = useTranslation()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

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

  const rowClassName = `group flex items-center gap-3 px-4 md:px-6 py-2.5 border-b border-zinc-100 ${isDragging ? 'opacity-50 z-10 relative bg-white' : ''}`
  const rowStyle = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={rowStyle} className={rowClassName}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.text}
        className="shrink-0 w-5 h-5 rounded-full border-2 border-primary hover:bg-primary/10 transition-colors"
      />

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            type="text"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={handleEditEnd}
            onKeyDown={handleDraftKeyDown}
            className="w-full bg-transparent text-sm border-b border-primary focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={handleEditStart}
            disabled={locked}
            className="text-left text-sm w-full truncate disabled:cursor-not-allowed"
          >
            {item.text}
            {locked && editor && (
              <span className="flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: editor.color }} />
                <span className="text-[11px] text-zinc-400">
                  {t('shoppingList.presenceEditing', { name: editor.nickname })}
                </span>
              </span>
            )}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onDelete}
        aria-label={t('common.delete')}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-zinc-300 hover:text-danger hover:bg-danger-50 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>

      {locked ? (
        <div className="shrink-0 w-7 h-7 flex items-center justify-center text-zinc-300">
          <LockIcon />
        </div>
      ) : (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="shrink-0 w-7 h-7 flex items-center justify-center cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 transition-colors rounded"
        >
          <GripIcon />
        </button>
      )}
    </div>
  )
}

export default SortableItemRow
