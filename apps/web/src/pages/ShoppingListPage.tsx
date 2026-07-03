import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'react-feather'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useShoppingList } from '@platekeeper/shared/hooks/useShoppingList'
import type { ShoppingListItem, PresenceUser } from '@platekeeper/shared/types'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'

// ── Grip icon (matches RecipesTable's drag handle) ────────────────────────────

const GripIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="currentColor"
    aria-hidden="true"
  >
    <circle cx="4" cy="3.5" r="1.2" />
    <circle cx="10" cy="3.5" r="1.2" />
    <circle cx="4" cy="7" r="1.2" />
    <circle cx="10" cy="7" r="1.2" />
    <circle cx="4" cy="10.5" r="1.2" />
    <circle cx="10" cy="10.5" r="1.2" />
  </svg>
)

// ── Presence chips ────────────────────────────────────────────────────────────

const PresenceBar = ({
  users,
  currentUserId,
}: {
  users: PresenceUser[]
  currentUserId?: string
}) => {
  const others = users.filter((u) => u.user_id !== currentUserId)
  if (others.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-zinc-100">
      {others.map((u) => (
        <div
          key={u.user_id}
          title={u.nickname}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
          style={{ backgroundColor: u.color }}
        >
          {u.nickname.charAt(0).toUpperCase()}
        </div>
      ))}
    </div>
  )
}

// ── Add item row ──────────────────────────────────────────────────────────────

const AddItemRow = ({ onAdd }: { onAdd: (text: string) => void }) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setText('')
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex items-center gap-3 px-4 py-3 bg-zinc-50 border-b border-zinc-100"
    >
      <Plus size={18} className="text-primary shrink-0" />
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('shoppingList.addItemPlaceholder')}
        className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-zinc-400"
      />
    </form>
  )
}

// ── Sortable row (incomplete items) ──────────────────────────────────────────

const SortableItemRow = ({
  item,
  locked,
  editor,
  onToggle,
  onEditText,
  onEditStart,
  onEditEnd,
  onDelete,
}: {
  item: ShoppingListItem
  locked: boolean
  editor?: PresenceUser
  onToggle: () => void
  onEditText: (text: string) => void
  onEditStart: () => void
  onEditEnd: () => void
  onDelete: () => void
}) => {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
  })

  const startEdit = () => {
    if (locked) return
    setDraft(item.text)
    setEditing(true)
    onEditStart()
  }

  const finishEdit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.text) onEditText(trimmed)
    setEditing(false)
    onEditEnd()
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100 ${isDragging ? 'opacity-50 z-10 relative bg-white' : ''}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.text}
        className="shrink-0 w-5 h-5 rounded-full border-2 border-primary hover:bg-primary/10 transition-colors"
      />

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            type="text"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finishEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setEditing(false)
                onEditEnd()
              }
            }}
            className="w-full bg-transparent text-sm border-b border-primary focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            disabled={locked}
            className="text-left text-sm w-full truncate disabled:cursor-not-allowed"
          >
            {item.text}
            {locked && editor && (
              <span className="flex items-center gap-1 mt-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
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
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
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

// ── Completed row ─────────────────────────────────────────────────────────────

const CompletedItemRow = ({
  item,
  onToggle,
  onDelete,
}: {
  item: ShoppingListItem
  onToggle: () => void
  onDelete: () => void
}) => {
  const { t } = useTranslation()

  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.text}
        className="shrink-0 w-5 h-5 rounded-full bg-zinc-300 flex items-center justify-center text-white"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </button>
      <span className="flex-1 min-w-0 truncate text-sm text-zinc-400 line-through">
        {item.text}
      </span>
      <button
        type="button"
        onClick={onDelete}
        aria-label={t('common.delete')}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-zinc-300 hover:text-danger hover:bg-danger-50 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const lockedByOther = (itemId: string): PresenceUser | undefined =>
    presence.find((u) => u.item_id === itemId && u.user_id !== user?.id)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = incompleteItems.findIndex((i) => i.id === active.id)
    const newIndex = incompleteItems.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(incompleteItems, oldIndex, newIndex)
    reorder.mutate(reordered.map((i) => i.id))
  }

  return (
    <>
      <PageHeader title={t('shoppingList.title')} />
      <div className="max-w-lg mx-auto md:max-w-2xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-zinc-400">
            <p className="text-sm">{t('common.loading')}</p>
          </div>
        ) : (
          <div className="bg-white md:border md:border-zinc-100 md:rounded-b-xl md:shadow-sm overflow-hidden">
            <PresenceBar users={presence} currentUserId={user?.id} />

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={incompleteItems.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {incompleteItems.map((item) => {
                  const editor = lockedByOther(item.id)

                  return (
                    <SortableItemRow
                      key={item.id}
                      item={item}
                      locked={!!editor}
                      editor={editor}
                      onToggle={() =>
                        toggle.mutate({
                          id: item.id,
                          completed: item.completed,
                        })
                      }
                      onEditText={(text) =>
                        editText.mutate({ id: item.id, text })
                      }
                      onEditStart={() => setEditing(item.id)}
                      onEditEnd={() => setEditing(null)}
                      onDelete={() => remove.mutate(item.id)}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>

            <AddItemRow onAdd={(text) => addItems.mutate([text])} />

            {completedItems.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-4 py-2 bg-zinc-50 border-b border-zinc-100">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {completedItems.length} {t('shoppingList.completedSection')}
                  </span>
                  <button
                    type="button"
                    onClick={() => clearCompleted.mutate()}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t('shoppingList.clearCompleted')}
                  </button>
                </div>
                {completedItems.map((item) => (
                  <CompletedItemRow
                    key={item.id}
                    item={item}
                    onToggle={() =>
                      toggle.mutate({ id: item.id, completed: item.completed })
                    }
                    onDelete={() => remove.mutate(item.id)}
                  />
                ))}
              </div>
            )}

            {incompleteItems.length === 0 && completedItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400 px-4 text-center">
                <p className="text-sm">
                  {t('shoppingList.addItemPlaceholder')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

export default ShoppingListPage
