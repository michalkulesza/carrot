import { Plus } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { MealPlanEntry } from '@carrot/shared/types'
import { proxyUrl } from '../../utils/imageUtils'
import RecipeThumb from './RecipeThumb'
import type { CalendarCell } from './helpers'

interface CalendarDayCellProps {
  cell: CalendarCell
  entry?: MealPlanEntry
  onClick: () => void
  isDragging?: boolean
  isDropTarget?: boolean
  onChipDragStart?: () => void
  onChipDragEnd?: () => void
  onCellDragOver?: () => void
  onCellDragLeave?: () => void
  onCellDrop?: () => void
}

const CalendarDayCell = ({
  cell,
  entry,
  onClick,
  isDragging = false,
  isDropTarget = false,
  onChipDragStart,
  onChipDragEnd,
  onCellDragOver,
  onCellDragLeave,
  onCellDrop,
}: CalendarDayCellProps) => {
  const { t } = useTranslation()
  const { day, isCurrentMonth, isToday, dateStr } = cell
  const entryTitle = entry?.recipe?.title ?? entry?.text
  const thumb = entry?.recipe ? proxyUrl(entry.recipe.thumbnail_url) : null
  const canBeDropTarget = isCurrentMonth
  const cellClassName = `border-r border-b p-2 text-left min-h-[110px] transition-colors group ${
    isDropTarget && canBeDropTarget
      ? 'bg-primary/5 border-zinc-200'
      : 'border-zinc-200'
  } ${isCurrentMonth ? 'bg-background hover:bg-primary/5' : 'bg-zinc-50/50'}`
  const dayNumberClassName = `text-sm font-medium inline-flex items-center justify-center w-7 h-7 rounded-full ${
    isToday
      ? 'bg-primary text-primary-foreground font-bold'
      : isCurrentMonth
        ? 'text-zinc-700'
        : 'text-zinc-300'
  }`
  const chipClassName = `mt-1.5 flex items-center gap-1.5 rounded-md bg-primary/10 px-1.5 py-1 overflow-hidden transition-opacity ${
    isDragging ? 'opacity-40' : ''
  }`

  const handleDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    if (!canBeDropTarget) return
    event.preventDefault()
    onCellDragOver?.()
  }

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    if (!canBeDropTarget) return
    event.preventDefault()
    onCellDrop?.()
  }

  return (
    <button
      onClick={onClick}
      className={cellClassName}
      onDragOver={handleDragOver}
      onDragLeave={onCellDragLeave}
      onDrop={handleDrop}
    >
      <span className={dayNumberClassName}>{day}</span>
      {entry ? (
        <div
          className={chipClassName}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', dateStr)
            event.dataTransfer.effectAllowed = 'move'
            onChipDragStart?.()
          }}
          onDragEnd={onChipDragEnd}
        >
          <RecipeThumb
            src={thumb}
            alt={entryTitle ?? ''}
            className="w-5 h-5 rounded shrink-0"
          />
          <span className="text-xs font-medium text-primary truncate">
            {entryTitle}
          </span>
        </div>
      ) : (
        isCurrentMonth && (
          <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-zinc-300 text-xs">
            <Plus className="w-3 h-3 shrink-0" />
            {t('common.add')}
          </div>
        )
      )}
    </button>
  )
}

export default CalendarDayCell
