import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import { useMealPlanStream } from './useMealPlanStream'
import { useTodayIso } from './useTodayIso'

export const useNextMealPlanEntry = (enabled = true) => {
  const api = useApiClient()
  useMealPlanStream(enabled)

  const todayIso = useTodayIso()

  const query = useQuery({
    queryKey: ['mealPlan', 'next', todayIso],
    queryFn: () => api.getNextMealPlanEntry(todayIso),
    enabled,
  })

  return {
    entry: query.data ?? null,
    todayIso,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
  }
}
