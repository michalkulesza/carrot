import type { CalendarDate } from '@internationalized/date'
import type {
  AllergenData,
  MealPlanEntry,
  RecipeOut,
} from '@carrot/shared/types'
import {
  ymToYYYYMM,
  ymdToISODate,
  toISODate,
  formatMonthLong,
} from '@carrot/shared/utils/dateUtils'
import i18n from '../../i18n'

export const getActiveAllergens = (
  householdAllergens: AllergenData | null | undefined,
  personalAllergens: AllergenData | null | undefined
): string[] => {
  const source = householdAllergens ?? personalAllergens
  if (!source) return []

  return [...(source.predefined ?? []), ...(source.custom ?? [])]
}

export interface CalendarCell {
  dateStr: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
}

export const exportMealPlan = async (year: number, month: number) => {
  const monthStr = ymToYYYYMM(year, month)
  const res = await fetch(`/api/export/meal-plan.xlsx?month=${monthStr}`)
  if (!res.ok) return

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const monthName = formatMonthLong(new Date(year, month - 1, 1), i18n.language)

  const a = document.createElement('a')
  a.href = url
  a.download = `meal-plan-${monthStr}-${monthName}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

const buildWeekRows = (
  entries: MealPlanEntry[],
  year: number,
  month: number
): (string | null)[][] => {
  const byDate = new Map(entries.map((e) => [e.date, e.recipe.title]))
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)

  const startMonday = new Date(firstDay)
  const dow = startMonday.getDay()
  startMonday.setDate(startMonday.getDate() + (dow === 0 ? -6 : 1 - dow))

  const weeks: Date[] = []
  for (
    let d = new Date(startMonday);
    d <= lastDay;
    d.setDate(d.getDate() + 7)
  ) {
    weeks.push(new Date(d))
  }

  const rows: (string | null)[][] = []
  for (let wi = 0; wi < 6; wi++) {
    const monday = weeks[wi]
    const row: (string | null)[] = []
    for (let i = 0; i < 7; i++) {
      if (monday) {
        const d = new Date(monday)
        d.setDate(d.getDate() + i)
        row.push(byDate.get(toISODate(d)) ?? null)
      } else {
        row.push(null)
      }
    }
    rows.push(row)
  }

  return rows
}

const PRINT_DAY_HEADERS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export const printMealPlan = (
  entries: MealPlanEntry[],
  year: number,
  month: number
) => {
  const rows = buildWeekRows(entries, year, month)
  const monthName = formatMonthLong(new Date(year, month - 1, 1), i18n.language)
  const headerCells = PRINT_DAY_HEADERS.map((d) => `<th>${d}</th>`).join('')
  const dataRows = rows
    .map((row, wi) => {
      const cells = row.map((cell) => `<td>${cell ?? ''}</td>`).join('')

      return `<tr class="${wi % 2 === 0 ? 'odd' : 'even'}">${cells}</tr>`
    })
    .join('')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Meal Plan – ${monthName} ${year}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Roboto', sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #356854;
    table-layout: fixed;
  }
  th {
    background: #356854;
    color: #fff;
    font-family: 'Times New Roman', serif;
    font-size: 12pt;
    text-align: center;
    vertical-align: middle;
    padding: 6px 4px;
    word-wrap: break-word;
  }
  td {
    font-family: 'Roboto', sans-serif;
    font-size: 9pt;
    color: #434343;
    text-align: center;
    vertical-align: middle;
    padding: 4px;
    height: 17mm;
    word-wrap: break-word;
  }
  tr.odd td  { background: #ffffff; }
  tr.even td { background: #f6f8f9; }
</style>
</head>
<body>
<table>
  <thead><tr>${headerCells}</tr></thead>
  <tbody>${dataRows}</tbody>
</table>
<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

export const buildCalendarCells = (
  viewYear: number,
  viewMonth: number,
  weekStart: number,
  todayDate: CalendarDate
): CalendarCell[] => {
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay()
  const startPad = (firstDow - weekStart + 7) % 7

  const cells: CalendarCell[] = []

  const prevMonthDays = new Date(viewYear, viewMonth - 1, 0).getDate()
  for (let i = startPad - 1; i >= 0; i--) {
    const day = prevMonthDays - i
    const m = viewMonth === 1 ? 12 : viewMonth - 1
    const y = viewMonth === 1 ? viewYear - 1 : viewYear
    cells.push({
      dateStr: ymdToISODate(y, m, day),
      day,
      isCurrentMonth: false,
      isToday: false,
    })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday =
      day === todayDate.day &&
      viewMonth === todayDate.month &&
      viewYear === todayDate.year
    cells.push({
      dateStr: ymdToISODate(viewYear, viewMonth, day),
      day,
      isCurrentMonth: true,
      isToday,
    })
  }

  let nextDay = 1
  while (cells.length % 7 !== 0) {
    const m = viewMonth === 12 ? 1 : viewMonth + 1
    const y = viewMonth === 12 ? viewYear + 1 : viewYear
    cells.push({
      dateStr: ymdToISODate(y, m, nextDay),
      day: nextDay++,
      isCurrentMonth: false,
      isToday: false,
    })
  }

  return cells
}

export const formatMacroSummary = (recipe: RecipeOut): string | null => {
  const parts = [
    recipe.kcal_per_serving != null ? `${recipe.kcal_per_serving} kcal` : null,
    recipe.protein_per_serving != null
      ? `${recipe.protein_per_serving}g P`
      : null,
    recipe.fat_per_serving != null ? `${recipe.fat_per_serving}g F` : null,
    recipe.carbs_per_serving != null ? `${recipe.carbs_per_serving}g C` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('  ·  ') : null
}
