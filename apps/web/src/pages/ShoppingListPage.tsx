import {
  useCallback,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
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
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import type { ShoppingListItem, PresenceUser } from '@carrot/shared/types'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../context/AuthContext'

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

const LockIcon = () => (
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
)

const CheckIcon = () => (
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
)

interface PresenceBarProps {
  users: PresenceUser[]
  currentUserId?: string
}

const PresenceBar = ({ users, currentUserId }: PresenceBarProps) => {
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

interface AddItemRowProps {
  onAdd: (text: string) => void
}

const AddItemRow = ({ onAdd }: AddItemRowProps) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const trimmed = text.trim()
      if (!trimmed) return
      onAdd(trimmed)
      setText('')
    },
    [text, onAdd]
  )

  return (
    <form
      onSubmit={handleSubmit}
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

  const startEdit = useCallback(() => {
    if (locked) return
    setDraft(item.text)
    setEditing(true)
    onEditStart()
  }, [locked, item.text, onEditStart])

  const finishEdit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.text) onEditText(trimmed)
    setEditing(false)
    onEditEnd()
  }, [draft, item.text, onEditText, onEditEnd])

  const handleDraftKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur()
      if (e.key === 'Escape') {
        setEditing(false)
        onEditEnd()
      }
    },
    [onEditEnd]
  )

  const rowClassName = `group flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100 ${isDragging ? 'opacity-50 z-10 relative bg-white' : ''}`
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
        {editing ? (
          <input
            type="text"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finishEdit}
            onKeyDown={handleDraftKeyDown}
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

interface CompletedItemRowProps {
  item: ShoppingListItem
  onToggle: () => void
  onDelete: () => void
}

const CompletedItemRow = ({
  item,
  onToggle,
  onDelete,
}: CompletedItemRowProps) => {
  const { t } = useTranslation()

  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100">
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.text}
        className="shrink-0 w-5 h-5 rounded-full bg-zinc-300 flex items-center justify-center text-white"
      >
        <CheckIcon />
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

const LoadingState = () => {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center py-24 text-zinc-400">
      <p className="text-sm">{t('common.loading')}</p>
    </div>
  )
}

const EmptyState = () => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-400 px-4 text-center">
      <p className="text-sm">{t('shoppingList.addItemPlaceholder')}</p>
    </div>
  )
}

interface CompletedSectionProps {
  items: ShoppingListItem[]
  onToggle: (item: ShoppingListItem) => void
  onDelete: (item: ShoppingListItem) => void
  onClear: () => void
}

const CompletedSection = ({
  items,
  onToggle,
  onDelete,
  onClear,
}: CompletedSectionProps) => {
  const { t } = useTranslation()
  if (items.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-50 border-b border-zinc-100">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {items.length} {t('shoppingList.completedSection')}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-primary hover:underline"
        >
          {t('shoppingList.clearCompleted')}
        </button>
      </div>
      {items.map((item) => (
        <CompletedItemRow
          key={item.id}
          item={item}
          onToggle={() => onToggle(item)}
          onDelete={() => onDelete(item)}
        />
      ))}
    </div>
  )
}

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

  const lockedByOther = useCallback(
    (itemId: string): PresenceUser | undefined =>
      presence.find((u) => u.item_id === itemId && u.user_id !== currentUserId),
    [presence, currentUserId]
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item) => {
          const editor = lockedByOther(item.id)

          return (
            <SortableItemRow
              key={item.id}
              item={item}
              locked={!!editor}
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

  const handleToggle = useCallback(
    (item: ShoppingListItem) =>
      toggle.mutate({ id: item.id, completed: item.completed }),
    [toggle]
  )

  const handleEditText = useCallback(
    (item: ShoppingListItem, text: string) =>
      editText.mutate({ id: item.id, text }),
    [editText]
  )

  const handleEditStart = useCallback(
    (item: ShoppingListItem) => setEditing(item.id),
    [setEditing]
  )

  const handleEditEnd = useCallback(() => setEditing(null), [setEditing])

  const handleDelete = useCallback(
    (item: ShoppingListItem) => remove.mutate(item.id),
    [remove]
  )

  const handleAdd = useCallback(
    (text: string) => addItems.mutate([text]),
    [addItems]
  )

  const handleClearCompleted = useCallback(
    () => clearCompleted.mutate(),
    [clearCompleted]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = incompleteItems.findIndex((i) => i.id === active.id)
      const newIndex = incompleteItems.findIndex((i) => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(incompleteItems, oldIndex, newIndex)
      reorder.mutate(reordered.map((i) => i.id))
    },
    [incompleteItems, reorder]
  )

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
