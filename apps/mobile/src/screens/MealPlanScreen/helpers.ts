import { toYYYYMM, toISODate, formatMonthYear } from '@carrot/shared/utils/dateUtils'

export const DAYS_BEFORE = 60
export const DAYS_AFTER = 180
export const DAY_ROW_HEIGHT = 72
export const MONTH_HEADER_HEIGHT = 36
// Width of the drag-handle hit zone at the right edge of the list, used both by
// DayRow's visible handle icon and the drag gesture's hitSlop so only that zone
// can start a drag — everything else (thumbnail, text, the row's own tap) is untouched.
export const DRAG_HANDLE_ZONE_WIDTH = 56

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

  const lastItem = items[items.length - 1]
  const lastHeight = lastItem?.type === 'month' ? MONTH_HEADER_HEIGHT : DAY_ROW_HEIGHT
  const contentHeight = (offsets.at(-1) ?? 0) + lastHeight

  return { items, offsets, todayIndex, months: Array.from(monthSet), contentHeight }
}

export const findDayIndexAtContentY = (offsets: number[], items: ListItem[], contentY: number): number => {
  'worklet'
  if (offsets.length === 0 || contentY < offsets[0]) return -1

  let lo = 0
  let hi = offsets.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (offsets[mid] <= contentY) lo = mid
    else hi = mid - 1
  }

  const item = items[lo]
  if (!item) return -1
  const height = item.type === 'month' ? MONTH_HEADER_HEIGHT : DAY_ROW_HEIGHT
  if (contentY >= offsets[lo] + height) return -1
  return item.type === 'day' ? lo : -1
}
