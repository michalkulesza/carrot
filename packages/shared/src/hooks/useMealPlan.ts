import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import { useMealPlanStream } from './useMealPlanStream'

export const useMealPlan = (month: string, enabled = true) => {
  const api = useApiClient()

  useMealPlanStream()

  const query = useQuery({
    queryKey: ['mealPlan', month],
    queryFn: () => api.listMealPlan(month),
    enabled: !!month && enabled,
  })

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  }
}
