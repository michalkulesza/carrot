import { Plus } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { MealPlanEntry } from '@carrot/shared/types'
import { proxyUrl } from '../../utils/imageUtils'
import RecipeThumb from './RecipeThumb'
import type { CalendarCell } from './helpers'

interface CalendarDayCellProps {
  cell: CalendarCell
  entries: MealPlanEntry[]
  onClick: () => void
  onEntryClick: (entry: MealPlanEntry) => void
  draggingEntryId?: string | null
  isDropTarget?: boolean
  onChipDragStart?: (entry: MealPlanEntry) => void
  onChipDragEnd?: () => void
  onCellDragOver?: () => void
  onCellDragLeave?: () => void
  onCellDrop?: () => void
}

interface CalendarEntryChipProps {
  entry: MealPlanEntry
  isDragging: boolean
  onClick: (entry: MealPlanEntry) => void
  onDragStart?: (entry: MealPlanEntry) => void
  onDragEnd?: () => void
}

const CalendarEntryChip = ({
  entry,
  isDragging,
  onClick,
  onDragStart,
  onDragEnd,
}: CalendarEntryChipProps) => {
  const entryTitle = entry.recipe?.title ?? entry.text
  const thumb = entry.recipe ? proxyUrl(entry.recipe.thumbnail_url) : null
  const chipClassName = `mt-1.5 flex items-center gap-1.5 rounded-md bg-primary/10 px-1.5 py-1 overflow-hidden transition-opacity ${
    isDragging ? 'opacity-40' : ''
  }`

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    onClick(entry)
  }

  const handleDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('text/plain', entry.id)
    event.dataTransfer.effectAllowed = 'move'
    onDragStart?.(entry)
  }

  return (
    <div
      className={chipClassName}
      draggable
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
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
  )
}

const CalendarDayCell = ({
  cell,
  entries,
  onClick,
  onEntryClick,
  draggingEntryId = null,
  isDropTarget = false,
  onChipDragStart,
  onChipDragEnd,
  onCellDragOver,
  onCellDragLeave,
  onCellDrop,
}: CalendarDayCellProps) => {
  const { t } = useTranslation()
  const { day, isCurrentMonth, isToday } = cell
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
      {entries.map((entry) => (
        <CalendarEntryChip
          key={entry.id}
          entry={entry}
          isDragging={draggingEntryId === entry.id}
          onClick={onEntryClick}
          onDragStart={onChipDragStart}
          onDragEnd={onChipDragEnd}
        />
      ))}
      {entries.length === 0 && isCurrentMonth && (
        <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-zinc-300 text-xs">
          <Plus className="w-3 h-3 shrink-0" />
          {t('common.add')}
        </div>
      )}
    </button>
  )
}

export default CalendarDayCell
