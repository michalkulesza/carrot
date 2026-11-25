import { useMemo } from 'react'
import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import type { MealPlanEntry } from '../types'
import { parseISODateLocal, toISODate, toYYYYMM } from '../utils/dateUtils'
import { useMealPlanStream } from './useMealPlanStream'

const DAYS_IN_WEEK = 7

const combineMonthResults = (results: UseQueryResult<MealPlanEntry[]>[]) => ({
  data: results.map((result) => result.data),
  isLoading: results.some((result) => result.isLoading),
  error: results.find((result) => result.error)?.error ?? null,
})

export const getDateRange = (startIso: string, dayCount: number): string[] => {
  const start = parseISODateLocal(startIso)

  return Array.from({ length: dayCount }, (_, index) =>
    toISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)),
  )
}

export const getWeekDates = (weekStartIso: string): string[] => getDateRange(weekStartIso, DAYS_IN_WEEK)

export const useMealPlanDays = (startIso: string, dayCount: number) => {
  const api = useApiClient()

  useMealPlanStream()

  const dates = useMemo(() => getDateRange(startIso, dayCount), [startIso, dayCount])
  const months = useMemo(
    () => [...new Set(dates.map((date) => toYYYYMM(parseISODateLocal(date))))],
    [dates],
  )

  const monthEntries = useQueries({
    queries: months.map((month) => ({
      queryKey: ['mealPlan', month],
      queryFn: () => api.listMealPlan(month),
    })),
    combine: combineMonthResults,
  })

  const { data, isLoading, error } = monthEntries
  const entriesByDate = useMemo(() => {
    const byDate = new Map<string, MealPlanEntry[]>(dates.map((date) => [date, []]))

    for (const entries of data) {
      for (const entry of entries ?? []) byDate.get(entry.date)?.push(entry)
    }

    return byDate
  }, [data, dates])

  return { entriesByDate, isLoading, error }
}
