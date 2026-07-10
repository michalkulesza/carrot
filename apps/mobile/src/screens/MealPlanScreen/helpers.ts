import { toYYYYMM, toISODate, formatMonthYear } from '@carrot/shared/utils/dateUtils'

export const DAYS_BEFORE = 60
export const DAYS_AFTER = 180
export const DAY_ROW_HEIGHT = 72
export const MONTH_HEADER_HEIGHT = 36

export type ListItem =
  | { type: 'month'; key: string; label: string }
  | { type: 'day'; key: string; date: Date; isoDate: string }

export const buildListItems = (today: Date, todayIso: string, language: string) => {
  const items: ListItem[] = []
  const offsets: number[] = []
  const monthSet = new Set<string>()
  let offset = 0
  let todayIndex = 0
  let prevMonth = ''

  const d = new Date(today)
  d.setDate(d.getDate() - DAYS_BEFORE)

  for (let i = 0; i < DAYS_BEFORE + DAYS_AFTER + 1; i++) {
    const monthKey = toYYYYMM(d)
    monthSet.add(monthKey)

    if (monthKey !== prevMonth) {
      prevMonth = monthKey
      offsets.push(offset)
      items.push({
        type: 'month',
        key: `month-${monthKey}`,
        label: formatMonthYear(d, language),
      })
      offset += MONTH_HEADER_HEIGHT
    }

    const iso = toISODate(d)
    if (iso === todayIso) todayIndex = items.length

    offsets.push(offset)
    items.push({ type: 'day', key: iso, date: new Date(d), isoDate: iso })
    offset += DAY_ROW_HEIGHT

    d.setDate(d.getDate() + 1)
  }

  return { items, offsets, todayIndex, months: Array.from(monthSet) }
}
