import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import type { MealPlanEntry } from '../types'
import { toISODate } from '../utils/dateUtils'

export const useMealPlan = (month: string) => {
  const api = useApiClient()
  const qc = useQueryClient()
  const todayIso = toISODate(new Date())

  useEffect(() => {
    return api.subscribeMealPlan(() => qc.invalidateQueries({ queryKey: ['mealPlan'] }))
  }, [api, qc])

  const query = useQuery({
    queryKey: ['mealPlan', month],
    queryFn: () => api.listMealPlan(month),
    enabled: !!month,
  })

  const setEntry = useMutation({
    mutationFn: ({ date, recipeId, text }: { date: string; recipeId?: string; text?: string }) =>
      api.setMealPlanEntry(date, { recipeId, text }),
    onSuccess: (entry) => {
      if (entry.date >= todayIso) {
        qc.setQueryData<MealPlanEntry | null>(['mealPlan', 'next', todayIso], (current) => {
          if (current === null || current === undefined || entry.date <= current.date) return entry
          return current
        })
      }
      void qc.invalidateQueries({ queryKey: ['mealPlan'] })
    },
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
