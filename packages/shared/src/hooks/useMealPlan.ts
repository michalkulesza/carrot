import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'

export const useMealPlan = (month: string) => {
  const api = useApiClient()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['mealPlan', month],
    queryFn: () => api.listMealPlan(month),
    enabled: !!month,
  })

  const setEntry = useMutation({
    mutationFn: ({ date, recipeId }: { date: string; recipeId: string }) =>
      api.setMealPlanEntry(date, recipeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mealPlan'] }),
  })

  const deleteEntry = useMutation({
    mutationFn: api.deleteMealPlanEntry,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mealPlan'] }),
  })

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    setEntry,
    deleteEntry,
  }
}
