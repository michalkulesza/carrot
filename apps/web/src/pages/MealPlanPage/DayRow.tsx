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
  entries: MealPlanEntry[]
  isToday: boolean
  isSelected: boolean
  setRef: (el: HTMLDivElement | null) => void
  onAdd: () => void
  onTap: (entry: MealPlanEntry) => void
}

interface DayRowEntryProps {
  entry: MealPlanEntry
  onTap: (entry: MealPlanEntry) => void
}

const DayRowEntry = ({ entry, onTap }: DayRowEntryProps) => {
  const entryTitle = entry.recipe?.title ?? entry.text
  const thumb = entry.recipe ? proxyUrl(entry.recipe.thumbnail_url) : null
  const macroSummary = entry.recipe ? formatMacroSummary(entry.recipe) : null
  const handleClick = () => onTap(entry)

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-3 min-w-0 active:opacity-60 transition-opacity"
    >
      <RecipeThumb
        src={thumb}
        alt={entryTitle ?? ''}
        className="w-12 h-12 rounded-xl shrink-0"
      />
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-semibold line-clamp-2 text-zinc-800 leading-snug">
          {entryTitle}
        </p>
        {macroSummary && (
          <p className="text-xs text-zinc-400 mt-0.5">{macroSummary}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
    </button>
  )
}

const DayRow = ({
  day,
  year,
  month,
  locale,
  entries,
  isToday,
  isSelected,
  setRef,
  onAdd,
  onTap,
}: DayRowProps) => {
  const { t } = useTranslation()
  const date = new Date(year, month - 1, day)
  const dayName = formatWeekdayShort(date, locale)
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

      <div className="flex-1 flex flex-col gap-2 min-w-0">
        {entries.map((entry) => (
          <DayRowEntry key={entry.id} entry={entry} onTap={onTap} />
        ))}
        {entries.length === 0 ? (
          <button
            onClick={onAdd}
            className="flex items-center gap-2 py-3 px-4 rounded-xl border border-dashed border-zinc-200 text-zinc-400 text-sm hover:border-zinc-400 hover:text-zinc-600 active:opacity-60 transition-all"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>{t('mealPlan.addDish')}</span>
          </button>
        ) : (
          <button
            onClick={onAdd}
            aria-label={t('mealPlan.addDish')}
            className="flex items-center gap-1 self-start text-xs text-zinc-400 hover:text-zinc-600 active:opacity-60 transition-colors"
          >
            <Plus className="w-3 h-3 shrink-0" />
            <span>{t('mealPlan.addDish')}</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default DayRow
