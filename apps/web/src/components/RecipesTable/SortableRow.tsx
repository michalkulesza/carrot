import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { RecipeOut } from '@carrot/shared/types'
import GripIcon from './GripIcon'
import StarIcon from './StarIcon'
import ThumbCell from './ThumbCell'
import NumericCell from './NumericCell'
import EmptyDash from './EmptyDash'
import RowMenu from './RowMenu'
import { formatDate } from './helpers'

interface SortableRowProps {
  recipe: RecipeOut
  showAddedBy: boolean
  cols: string
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleFavourite: () => void
}

const SortableRow = ({
  recipe,
  showAddedBy,
  cols,
  onView,
  onEdit,
  onDelete,
  onToggleFavourite,
}: SortableRowProps) => {
  const { t } = useTranslation()

  // Both attributes and listeners go on the grip button (correct drag-handle pattern)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: recipe.id })

  const handleGripClick = useCallback(
    (e: React.MouseEvent) => e.stopPropagation(),
    []
  )

  const handleFavouriteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggleFavourite()
    },
    [onToggleFavourite]
  )

  const handleThumbClick = useCallback(
    (e: React.MouseEvent) => e.stopPropagation(),
    []
  )

  const handleMenuClick = useCallback(
    (e: React.MouseEvent) => e.stopPropagation(),
    []
  )

  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridTemplateColumns: cols,
  }
  const rowClassName = `group grid items-center gap-2 px-2 py-2 border-b border-zinc-100 hover:bg-zinc-50 transition-colors cursor-pointer select-none ${isDragging ? 'opacity-50 z-10 relative' : ''}`
  const starButtonClassName = `flex items-center justify-center w-full h-8 transition-colors rounded ${recipe.is_favourite ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-300 hover:text-amber-400'}`
  const favouriteAriaLabel = recipe.is_favourite
    ? t('recipes.removeFromFavourites')
    : t('recipes.addToFavourites')

  return (
    <div
      ref={setNodeRef}
      style={rowStyle}
      className={rowClassName}
      onClick={onView}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={handleGripClick}
        className="flex items-center justify-center w-full h-8 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 transition-colors rounded"
        aria-label={t('recipes.dragToReorder')}
      >
        <GripIcon />
      </button>

      <button
        type="button"
        onClick={handleFavouriteClick}
        className={starButtonClassName}
        aria-label={favouriteAriaLabel}
      >
        <StarIcon filled={recipe.is_favourite} />
      </button>

      <div className="flex items-center" onClick={handleThumbClick}>
        <ThumbCell url={recipe.thumbnail_url} title={recipe.title} />
      </div>

      <div className="min-w-0 overflow-hidden">
        <p className="font-medium text-sm leading-snug line-clamp-2">
          {recipe.title}
        </p>
      </div>

      <NumericCell value={recipe.servings} />
      <NumericCell value={recipe.kcal_per_serving} />
      <NumericCell value={recipe.protein_per_serving} />
      <NumericCell value={recipe.fat_per_serving} />
      <NumericCell value={recipe.carbs_per_serving} />

      <div className="text-sm text-zinc-500 truncate overflow-hidden">
        {recipe.creator_handle ? `@${recipe.creator_handle}` : <EmptyDash />}
      </div>

      {showAddedBy && (
        <div className="text-sm text-zinc-500 truncate overflow-hidden">
          {recipe.added_by ?? <EmptyDash />}
        </div>
      )}

      <div className="text-xs text-zinc-400 whitespace-nowrap overflow-hidden">
        {formatDate(recipe.created_at)}
      </div>

      <div
        className="sticky right-0 z-[1] bg-white group-hover:bg-zinc-50 transition-colors shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]"
        onClick={handleMenuClick}
      >
        <RowMenu onView={onView} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  )
}

export default SortableRow
