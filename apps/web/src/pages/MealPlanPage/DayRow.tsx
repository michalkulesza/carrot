import { ChevronRight, Plus } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { MealPlanEntry } from '@carrot/shared/types'
import { formatWeekdayShort } from '@carrot/shared/utils/dateUtils'
import { proxyUrl } from '../../utils/imageUtils'
import { formatMacroSummary } from './helpers'
import RecipeThumb from './RecipeThumb'

interface DayRowProps {
  day: number
  year: number
  month: number
  locale: string
  entry?: MealPlanEntry
  isToday: boolean
  isSelected: boolean
  setRef: (el: HTMLDivElement | null) => void
  onAdd: () => void
  onTap: () => void
}

const DayRow = ({
  day,
  year,
  month,
  locale,
  entry,
  isToday,
  isSelected,
  setRef,
  onAdd,
  onTap,
}: DayRowProps) => {
  const { t } = useTranslation()
  const date = new Date(year, month - 1, day)
  const dayName = formatWeekdayShort(date, locale)
  const thumb = entry ? proxyUrl(entry.recipe.thumbnail_url) : null
  const macroSummary = entry ? formatMacroSummary(entry.recipe) : null
  const dateColumnClassName = `w-12 shrink-0 text-center ${isToday || isSelected ? 'text-primary' : 'text-zinc-500'}`
  const dayNumberClassName = `text-2xl font-bold leading-tight ${isSelected ? 'text-primary' : 'text-zinc-800'}`
  const dividerClassName = `w-px self-stretch ${isToday || isSelected ? 'bg-primary/30' : 'bg-zinc-200'}`

  return (
    <div
      ref={setRef}
      className={`flex items-center gap-3 py-3 border-b border-zinc-200 border-l-[3px] transition-colors ${
        isSelected ? 'border-l-primary bg-primary/10' : 'border-l-transparent'
      } pl-[13px] pr-4`}
    >
      <div className={dateColumnClassName}>
        <p className="text-[10px] font-semibold uppercase tracking-wide">
          {dayName}
        </p>
        {isToday ? (
          <p className="text-2xl font-bold leading-none flex items-center justify-center mx-auto w-9 h-9 rounded-full bg-primary text-primary-foreground">
            {day}
          </p>
        ) : (
          <p className={dayNumberClassName}>{day}</p>
        )}
      </div>

      <div className={dividerClassName} />

      {entry ? (
        <button
          onClick={onTap}
          className="flex-1 flex items-center gap-3 min-w-0 active:opacity-60 transition-opacity"
        >
          {thumb ? (
            <RecipeThumb
              src={thumb}
              alt={entry.recipe.title}
              className="w-12 h-12 rounded-xl shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-zinc-100 shrink-0 flex items-center justify-center text-xl">
              🍽
            </div>
          )}
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-semibold line-clamp-2 text-zinc-800 leading-snug">
              {entry.recipe.title}
            </p>
            {macroSummary && (
              <p className="text-xs text-zinc-400 mt-0.5">{macroSummary}</p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
        </button>
      ) : (
        <button
          onClick={onAdd}
          className="flex-1 flex items-center gap-2 py-3 px-4 rounded-xl border border-dashed border-zinc-200 text-zinc-400 text-sm hover:border-zinc-400 hover:text-zinc-600 active:opacity-60 transition-all"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>{t('mealPlan.addDish')}</span>
        </button>
      )}
    </div>
  )
}

export default DayRow
