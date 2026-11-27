import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import { useMealPlanStream } from './useMealPlanStream'
import type { MealPlanEntry } from '../types'
import { useTodayIso } from './useTodayIso'

const EMPTY_ENTRIES: MealPlanEntry[] = []

export const useNextMealPlanDay = (enabled = true) => {
  const api = useApiClient()
  useMealPlanStream(enabled)

  const todayIso = useTodayIso()

  const query = useQuery({
    queryKey: ['mealPlan', 'nextDay', todayIso],
    queryFn: () => api.getNextMealPlanDay(todayIso),
    enabled,
  })

  return {
    entries: query.data ?? EMPTY_ENTRIES,
    todayIso,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
