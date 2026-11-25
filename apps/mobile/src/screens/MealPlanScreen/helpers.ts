import type { MealPlanEntry } from '@carrot/shared/types'
import { getWeekDates } from '@carrot/shared/hooks/useMealPlanDays'
import { parseISODateLocal, toISODate } from '@carrot/shared/utils/dateUtils'

export const DAYS_IN_WEEK = 7

export interface WeekDay {
  iso: string
  date: Date
  dayNumber: number
  weekdayShort: string
  weekdayLong: string
  isToday: boolean
  isPast: boolean
  entries: MealPlanEntry[]
}

export const getWeekStartIso = (date: Date, weekStartDay: number): string => {
  const offset = (date.getDay() - weekStartDay + DAYS_IN_WEEK) % DAYS_IN_WEEK

  return toISODate(new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset))
}

export const shiftWeek = (weekStartIso: string, weeks: number): string => {
  const start = parseISODateLocal(weekStartIso)

  return toISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + weeks * DAYS_IN_WEEK))
}

export const formatWeekRange = (weekStartIso: string, locale: string): string => {
  const [startIso, , , , , , endIso] = getWeekDates(weekStartIso)
  const start = parseISODateLocal(startIso)
  const end = parseISODateLocal(endIso)

  const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const sameMonth = start.getMonth() === end.getMonth()

  if (sameMonth) return `${start.getDate()} – ${dayMonth.format(end)}`

  return `${dayMonth.format(start)} – ${dayMonth.format(end)}`
}

export const formatDayMonth = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(parseISODateLocal(iso))

export const formatWeekdayLong = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(parseISODateLocal(iso))

export const formatWeekdayDayMonth = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(
    parseISODateLocal(iso),
  )

export const buildWeekDays = (
  weekStartIso: string,
  entriesByDate: Map<string, MealPlanEntry[]>,
  todayIso: string,
  locale: string,
): WeekDay[] => {
  const weekday = (date: Date, style: 'short' | 'long') =>
    new Intl.DateTimeFormat(locale, { weekday: style }).format(date)

  return getWeekDates(weekStartIso).map((iso) => {
    const date = parseISODateLocal(iso)

    return {
      iso,
      date,
      dayNumber: date.getDate(),
      weekdayShort: weekday(date, 'short'),
      weekdayLong: weekday(date, 'long'),
      isToday: iso === todayIso,
      isPast: iso < todayIso,
      entries: entriesByDate.get(iso) ?? [],
    }
  })
}

export const getEntryTitle = (entry: MealPlanEntry): string => entry.recipe?.title ?? entry.text ?? ''
