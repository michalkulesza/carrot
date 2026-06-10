import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { createPortal } from 'react-dom'
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
import type { RecipeOut } from '@platekeeper/shared/types'
import { reorderRecipes, toggleFavourite } from '../api/client'

type SortField =
  | 'title'
  | 'servings'
  | 'kcal_per_serving'
  | 'creator_handle'
  | 'added_by'
  | 'created_at'
type SortDir = 'asc' | 'desc'
type Sort = { field: SortField; dir: SortDir } | null

const StarIcon = ({ filled }: { filled: boolean }) =>
  filled ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )

interface RecipesTableProps {
  recipes: RecipeOut[]
  showAddedBy: boolean
  onView: (recipe: RecipeOut) => void
  onEdit: (recipe: RecipeOut) => void
  onDelete: (recipe: RecipeOut) => void
  onToggleFavourite: (recipe: RecipeOut) => void
}

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

const SortIndicator = ({ field, sort }: { field: SortField; sort: Sort }) => {
  if (!sort || sort.field !== field) {
    return <span className="ml-1 text-zinc-300 text-[10px]">↕</span>
  }

  return (
    <span className="ml-1 text-primary text-[10px]">
      {sort.dir === 'asc' ? '↑' : '↓'}
    </span>
  )
}

const ColHeader = ({
  label,
  field,
  sort,
  onToggleSort,
  align = 'left',
}: {
  label: string
  field: SortField
  sort: Sort
  onToggleSort: (field: SortField) => void
  align?: 'left' | 'right'
}) => {
  const active = sort?.field === field

  return (
    <button
      type="button"
      onClick={() => onToggleSort(field)}
      className={`flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide transition-colors whitespace-nowrap ${align === 'right' ? 'justify-end' : 'justify-start'} ${active ? 'text-zinc-700' : 'text-zinc-400 hover:text-zinc-600'}`}
    >
      {label}
      <SortIndicator field={field} sort={sort} />
    </button>
  )
}

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(i18n.language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const ThumbCell = ({ url, title }: { url: string | null; title: string }) => {
  const [loaded, setLoaded] = useState(false)
  const proxyUrl = url
    ? `/api/proxy/image?url=${encodeURIComponent(url)}`
    : null

  return (
    <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-100 shrink-0 relative">
      {!loaded && proxyUrl && (
        <div className="absolute inset-0 animate-pulse bg-zinc-200" />
      )}
      {proxyUrl ? (
        <img
          src={proxyUrl}
          alt={title}
          onLoad={() => setLoaded(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-200 text-xl">
          🍽
        </div>
      )}
    </div>
  )
}

// Portal-based dropdown — renders into document.body so overflow:hidden can't clip it
const RowMenu = ({
  onView,
  onEdit,
  onDelete,
}: {
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)

    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div className="flex items-center justify-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={openMenu}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors text-base leading-none"
        aria-label="Row actions"
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: pos.top,
              right: pos.right,
              zIndex: 9999,
            }}
            className="w-36 rounded-xl bg-white shadow-xl border border-zinc-100 py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-50 transition-colors"
              onClick={() => {
                setOpen(false)
                onView()
              }}
            >
              {t('common.view')}
            </button>
            <button
              className="w-full text-left px-4 py-2 text-sm hover:bg-zinc-50 transition-colors"
              onClick={() => {
                setOpen(false)
                onEdit()
              }}
            >
              {t('common.edit')}
            </button>
            <button
              className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-danger-50 transition-colors"
              onClick={() => {
                setOpen(false)
                onDelete()
              }}
            >
              {t('common.delete')}
            </button>
          </div>,
          document.body
        )}
    </div>
  )
}

const SortableRow = ({
  recipe,
  showAddedBy,
  cols,
  onView,
  onEdit,
  onDelete,
  onToggleFavourite,
}: {
  recipe: RecipeOut
  showAddedBy: boolean
  cols: string
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleFavourite: () => void
}) => {
  // Both attributes and listeners go on the grip button (correct drag-handle pattern)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: recipe.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        gridTemplateColumns: cols,
      }}
      className={`group grid items-center gap-2 px-2 py-2 border-b border-zinc-100 hover:bg-zinc-50 transition-colors cursor-pointer select-none ${isDragging ? 'opacity-50 z-10 relative' : ''}`}
      onClick={onView}
    >
      {/* Grip — both listeners and attributes live here */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-center w-full h-8 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 transition-colors rounded"
        aria-label="Drag to reorder"
      >
        <GripIcon />
      </button>

      {/* Star / favourite */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavourite()
        }}
        className={`flex items-center justify-center w-full h-8 transition-colors rounded ${recipe.is_favourite ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-300 hover:text-amber-400'}`}
        aria-label={recipe.is_favourite ? 'Remove from favourites' : 'Add to favourites'}
      >
        <StarIcon filled={recipe.is_favourite} />
      </button>

      {/* Thumbnail */}
      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
        <ThumbCell url={recipe.thumbnail_url} title={recipe.title} />
      </div>

      {/* Title */}
      <div className="min-w-0 overflow-hidden">
        <p className="font-medium text-sm leading-snug line-clamp-2">
          {recipe.title}
        </p>
      </div>

      {/* Servings */}
      <div className="text-sm text-zinc-600 text-right tabular-nums pr-2 overflow-hidden">
        {recipe.servings != null ? (
          recipe.servings
        ) : (
          <span className="text-zinc-300">—</span>
        )}
      </div>

      {/* Kcal */}
      <div className="text-sm text-zinc-600 text-right tabular-nums pr-2 overflow-hidden">
        {recipe.kcal_per_serving != null ? (
          recipe.kcal_per_serving
        ) : (
          <span className="text-zinc-300">—</span>
        )}
      </div>

      {/* Author */}
      <div className="text-sm text-zinc-500 truncate overflow-hidden">
        {recipe.creator_handle ? (
          `@${recipe.creator_handle}`
        ) : (
          <span className="text-zinc-300">—</span>
        )}
      </div>

      {/* Added by */}
      {showAddedBy && (
        <div className="text-sm text-zinc-500 truncate overflow-hidden">
          {recipe.added_by ?? <span className="text-zinc-300">—</span>}
        </div>
      )}

      {/* Added date */}
      <div className="text-xs text-zinc-400 whitespace-nowrap overflow-hidden">
        {formatDate(recipe.created_at)}
      </div>

      {/* ⋯ menu — sticky right */}
      <div
        className="sticky right-0 z-[1] bg-white group-hover:bg-zinc-50 transition-colors shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]"
        onClick={(e) => e.stopPropagation()}
      >
        <RowMenu onView={onView} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  )
}

const getSortValue = (
  recipe: RecipeOut,
  field: SortField
): string | number | null => {
  switch (field) {
    case 'title':
      return recipe.title.toLowerCase()
    case 'servings':
      return recipe.servings
    case 'kcal_per_serving':
      return recipe.kcal_per_serving
    case 'creator_handle':
      return recipe.creator_handle?.toLowerCase() ?? null
    case 'added_by':
      return recipe.added_by?.toLowerCase() ?? null
    case 'created_at':
      return recipe.created_at
  }
}

const applySortRows = (rows: RecipeOut[], sort: Sort): RecipeOut[] => {
  if (!sort) return rows

  return [...rows].sort((a, b) => {
    const av = getSortValue(a, sort.field)
    const bv = getSortValue(b, sort.field)
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    const cmp = av < bv ? -1 : av > bv ? 1 : 0

    return sort.dir === 'asc' ? cmp : -cmp
  })
}

const RecipesTable = ({
  recipes,
  showAddedBy,
  onView,
  onEdit,
  onDelete,
  onToggleFavourite,
}: RecipesTableProps) => {
  const { t } = useTranslation()
  const [sort, setSort] = useState<Sort>({ field: 'created_at', dir: 'desc' })
  const [localRows, setLocalRows] = useState<RecipeOut[]>(recipes)

  // Merge external recipe updates (edits, deletes, adds) without losing drag order
  useEffect(() => {
    setLocalRows((prev) => {
      const map = new Map(recipes.map((r) => [r.id, r]))
      const updated = prev
        .filter((r) => map.has(r.id))
        .map((r) => map.get(r.id)!)
      const prevIds = new Set(prev.map((r) => r.id))
      const added = recipes.filter((r) => !prevIds.has(r.id))

      return [...added, ...updated]
    })
  }, [recipes])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    // Drag operates on whatever is currently displayed (sorted or not)
    const source = sort ? applySortRows(localRows, sort) : localRows
    const oldIdx = source.findIndex((r) => r.id === active.id)
    const newIdx = source.findIndex((r) => r.id === over.id)
    const reordered = arrayMove(source, oldIdx, newIdx)
    setLocalRows(reordered)
    setSort(null) // dragging always clears column sort → manual mode
    reorderRecipes(reordered.map((r) => r.id)).catch(() => {})
  }

  const toggleSort = (field: SortField) => {
    setSort((prev) => {
      if (prev?.field === field)
        return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }

      return { field, dir: field === 'created_at' ? 'desc' : 'asc' }
    })
  }

  const displayed = sort ? applySortRows(localRows, sort) : localRows

  const cols = showAddedBy
    ? '32px 28px 56px minmax(135px,1fr) 72px 72px 120px 120px 100px 40px'
    : '32px 28px 56px minmax(135px,1fr) 72px 72px 120px 100px 40px'

  return (
    <div className="px-4 mt-4 pb-6">
      <div className="rounded-xl bg-white shadow-sm border border-zinc-100 overflow-hidden">
        {/* Horizontal scroll container — sticky children anchor to this viewport */}
        <div className="overflow-x-auto">
          {/* Header */}
          <div
            className="grid items-center gap-2 px-2 py-2.5 border-b-2 border-zinc-100 bg-zinc-50 rounded-t-xl"
            style={{ gridTemplateColumns: cols }}
          >
            <div
              className="flex items-center justify-center text-zinc-300"
              title="Drag rows to reorder"
            >
              <GripIcon />
            </div>
            <div />
            <div />
            <ColHeader
              label={t('recipes.colTitle')}
              field="title"
              sort={sort}
              onToggleSort={toggleSort}
            />
            <div className="flex justify-end">
              <ColHeader
                label={t('recipes.colServings')}
                field="servings"
                sort={sort}
                onToggleSort={toggleSort}
                align="right"
              />
            </div>
            <div className="flex justify-end">
              <ColHeader
                label={t('recipes.colKcal')}
                field="kcal_per_serving"
                sort={sort}
                onToggleSort={toggleSort}
                align="right"
              />
            </div>
            <ColHeader
              label={t('recipes.colAuthor')}
              field="creator_handle"
              sort={sort}
              onToggleSort={toggleSort}
            />
            {showAddedBy && (
              <ColHeader
                label={t('recipes.colAddedBy')}
                field="added_by"
                sort={sort}
                onToggleSort={toggleSort}
              />
            )}
            <ColHeader
              label={t('recipes.colAdded')}
              field="created_at"
              sort={sort}
              onToggleSort={toggleSort}
            />
            {/* Sticky dots column */}
            <div className="sticky right-0 z-[1] bg-zinc-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]" />
          </div>

          {/* Rows */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={displayed.map((r) => r.id)}
              strategy={verticalListSortingStrategy}
            >
              {displayed.map((recipe) => (
                <SortableRow
                  key={recipe.id}
                  recipe={recipe}
                  showAddedBy={showAddedBy}
                  cols={cols}
                  onView={() => onView(recipe)}
                  onEdit={() => onEdit(recipe)}
                  onDelete={() => onDelete(recipe)}
                  onToggleFavourite={() => onToggleFavourite(recipe)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  )
}

export default RecipesTable
