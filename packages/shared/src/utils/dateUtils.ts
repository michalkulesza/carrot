/** Date object → "YYYY-MM" */
export const toYYYYMM = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

/** Date object → "YYYY-MM-DD" */
export const toISODate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Numeric year + 1-indexed month → "YYYY-MM" */
export const ymToYYYYMM = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`

/** Numeric year + 1-indexed month + day → "YYYY-MM-DD" */
export const ymdToISODate = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

/** Locale-aware short weekday name from a Date (e.g. "Mon", "Lun") */
export const formatWeekdayShort = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)

/** Locale-aware short weekday name from a 0-indexed day (0=Sun … 6=Sat) */
export const weekdayShortByIndex = (dayIndex: number, locale: string): string =>
  formatWeekdayShort(new Date(2024, 0, 7 + dayIndex), locale)

/** Locale-aware "Month Year" string (e.g. "January 2025", "Januar 2025") */
export const formatMonthYear = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)

/** Locale-aware month name only (e.g. "January", "Janvier") */
export const formatMonthLong = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { month: 'long' }).format(date)

export const parseISODateLocal = (isoDate: string): Date => {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const formatNextMealDate = (
  isoDate: string,
  todayIso: string,
  locale: string,
  todayLabel: string,
  tomorrowLabel: string,
): string => {
  if (isoDate === todayIso) return todayLabel

  const tomorrow = parseISODateLocal(todayIso)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (isoDate === toISODate(tomorrow)) return tomorrowLabel

  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
    parseISODateLocal(isoDate),
  )
}
