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
}

const CalendarDayCell = ({ cell, entry, onClick }: CalendarDayCellProps) => {
  const { t } = useTranslation()
  const { day, isCurrentMonth, isToday } = cell
  const thumb = entry ? proxyUrl(entry.recipe.thumbnail_url) : null
  const cellClassName = `border-r border-b border-zinc-200 p-2 text-left min-h-[110px] transition-colors group ${
    isCurrentMonth ? 'bg-background hover:bg-primary/5' : 'bg-zinc-50/50'
  }`
  const dayNumberClassName = `text-sm font-medium inline-flex items-center justify-center w-7 h-7 rounded-full ${
    isToday
      ? 'bg-primary text-primary-foreground font-bold'
      : isCurrentMonth
        ? 'text-zinc-700'
        : 'text-zinc-300'
  }`

  return (
    <button onClick={onClick} className={cellClassName}>
      <span className={dayNumberClassName}>{day}</span>
      {entry ? (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-primary/10 px-1.5 py-1 overflow-hidden">
          {thumb && (
            <RecipeThumb
              src={thumb}
              alt={entry.recipe.title}
              className="w-5 h-5 rounded shrink-0"
            />
          )}
          <span className="text-xs font-medium text-primary truncate">
            {entry.recipe.title}
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
