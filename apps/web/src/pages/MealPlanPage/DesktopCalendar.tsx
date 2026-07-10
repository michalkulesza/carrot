import { useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'react-feather'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@heroui/react'
import type { CalendarDate } from '@internationalized/date'
import type { MealPlanEntry } from '@carrot/shared/types'
import {
  formatMonthYear,
  weekdayShortByIndex,
} from '@carrot/shared/utils/dateUtils'
import { buildCalendarCells } from './helpers'
import CalendarDayCell from './CalendarDayCell'

interface DesktopCalendarProps {
  viewYear: number
  viewMonth: number
  locale: string
  entriesByDate: Map<string, MealPlanEntry>
  loading: boolean
  todayDate: CalendarDate
  weekStart: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onCellClick: (dateStr: string, entry?: MealPlanEntry) => void
}

const DesktopCalendar = ({
  viewYear,
  viewMonth,
  locale,
  entriesByDate,
  loading,
  todayDate,
  weekStart,
  onPrev,
  onNext,
  onToday,
  onCellClick,
}: DesktopCalendarProps) => {
  const { t } = useTranslation()

  const dayHeaders = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        weekdayShortByIndex((weekStart + i) % 7, locale)
      ),
    [weekStart, locale]
  )

  const cells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth, weekStart, todayDate),
    [viewYear, viewMonth, weekStart, todayDate]
  )

  const getCellClickHandler = useCallback(
    (dateStr: string, entry?: MealPlanEntry) => () =>
      onCellClick(dateStr, entry),
    [onCellClick]
  )

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">
          {formatMonthYear(new Date(viewYear, viewMonth - 1, 1), locale)}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onToday}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 hover:bg-zinc-100 transition-colors"
          >
            {t('mealPlan.today')}
          </button>
          <div className="flex">
            <button
              onClick={onPrev}
              className="p-1.5 rounded-l-lg border border-zinc-200 hover:bg-zinc-100 transition-colors"
              aria-label={t('mealPlan.prevMonth')}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={onNext}
              className="p-1.5 rounded-r-lg border border-l-0 border-zinc-200 hover:bg-zinc-100 transition-colors"
              aria-label={t('mealPlan.nextMonth')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 border-l border-t border-zinc-200 rounded-xl overflow-hidden">
        {dayHeaders.map((h) => (
          <div
            key={h}
            className="border-r border-b border-zinc-200 bg-zinc-50 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-zinc-400"
          >
            {h}
          </div>
        ))}

        {loading ? (
          <div className="col-span-7 flex items-center justify-center h-48">
            <Spinner />
          </div>
        ) : (
          cells.map((cell) => (
            <CalendarDayCell
              key={cell.dateStr}
              cell={cell}
              entry={entriesByDate.get(cell.dateStr)}
              onClick={getCellClickHandler(
                cell.dateStr,
                entriesByDate.get(cell.dateStr)
              )}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default DesktopCalendar
