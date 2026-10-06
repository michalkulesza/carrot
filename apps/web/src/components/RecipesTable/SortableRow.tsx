import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { RecipeOut } from '@carrot/shared/types'
import GripIcon from './GripIcon'
import StarIcon from './StarIcon'
import ThumbCell from './ThumbCell'
import NumericCell from './NumericCell'
import MacroCell from './MacroCell'
import type { MacroMax } from './helpers'
import EmptyDash from './EmptyDash'
import RowMenu from './RowMenu'
import { formatDate } from './helpers'
import HouseholdAvatarIndicators from '../HouseholdAvatarIndicators'

interface SortableRowProps {
  recipe: RecipeOut
  showAddedBy: boolean
  cols: string
  macroMax: MacroMax
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleFavourite: () => void
}

const SortableRow = ({
  recipe,
  showAddedBy,
  cols,
  macroMax,
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
  const rowClassName = `group grid items-center gap-3.5 px-5 py-2.5 border-b border-mist text-[15px] hover:bg-row-hover transition-colors cursor-pointer select-none ${isDragging ? 'opacity-50 z-10 relative' : ''}`
  const starButtonClassName = `flex items-center justify-center w-full h-8 transition-colors rounded ${recipe.is_favourite ? 'text-amber-400 hover:text-amber-300' : 'text-ink-ghost hover:text-amber-400'}`
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
        className="flex items-center justify-center w-full h-8 cursor-grab active:cursor-grabbing text-ink-ghost hover:text-ink-faint transition-colors rounded"
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
        <p className="font-extrabold text-[15px] leading-snug line-clamp-2 text-pretty">
          {recipe.title}
        </p>
      </div>

      <NumericCell value={recipe.servings} centered />
      <NumericCell value={recipe.kcal_per_serving} />
      <MacroCell
        value={recipe.protein_per_serving}
        max={macroMax.protein}
        macro="protein"
      />
      <MacroCell
        value={recipe.fat_per_serving}
        max={macroMax.fat}
        macro="fat"
      />
      <MacroCell
        value={recipe.carbs_per_serving}
        max={macroMax.carbs}
        macro="carbs"
      />

      <HouseholdAvatarIndicators recipe={recipe} size="sm" />

      <div className="text-ink-soft truncate overflow-hidden">
        {recipe.creator_handle ? `@${recipe.creator_handle}` : <EmptyDash />}
      </div>

      {showAddedBy && (
        <div className="text-ink-soft truncate overflow-hidden">
          {recipe.added_by ?? <EmptyDash />}
        </div>
      )}

      <div className="text-[13px] text-ink-subtle whitespace-nowrap overflow-hidden">
        {formatDate(recipe.created_at)}
      </div>

      <div
        className="sticky right-0 z-[1] bg-white group-hover:bg-row-hover transition-colors"
        onClick={handleMenuClick}
      >
        <RowMenu onView={onView} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  )
}

export default SortableRow
