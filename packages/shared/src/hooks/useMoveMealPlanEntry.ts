import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import type { MealPlanEntry } from '../types'

const monthKey = (date: string) => date.slice(0, 7)

export const useMoveMealPlanEntry = () => {
  const api = useApiClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => api.moveMealPlanEntry(from, to),
    onMutate: async ({ from, to }) => {
      await qc.cancelQueries({ queryKey: ['mealPlan'] })

      const fromMonth = monthKey(from)
      const toMonth = monthKey(to)
      const previousFrom = qc.getQueryData<MealPlanEntry[]>(['mealPlan', fromMonth])
      const previousTo =
        toMonth === fromMonth ? previousFrom : qc.getQueryData<MealPlanEntry[]>(['mealPlan', toMonth])

      const fromEntries = previousFrom ?? []
      const toEntries = previousTo ?? []
      const source = fromEntries.find((entry) => entry.date === from)

      if (source) {
        const target = toEntries.find((entry) => entry.date === to)

        if (target) {
          const swappedSource: MealPlanEntry = { ...source, recipe: target.recipe, text: target.text }
          const swappedTarget: MealPlanEntry = { ...target, recipe: source.recipe, text: source.text }

          if (toMonth === fromMonth) {
            qc.setQueryData<MealPlanEntry[]>(
              ['mealPlan', fromMonth],
              fromEntries.map((entry) => {
                if (entry.date === from) return swappedSource
                if (entry.date === to) return swappedTarget
                return entry
              }),
            )
          } else {
            qc.setQueryData<MealPlanEntry[]>(
              ['mealPlan', fromMonth],
              fromEntries.map((entry) => (entry.date === from ? swappedSource : entry)),
            )
            qc.setQueryData<MealPlanEntry[]>(
              ['mealPlan', toMonth],
              toEntries.map((entry) => (entry.date === to ? swappedTarget : entry)),
            )
          }
        } else {
          const movedSource: MealPlanEntry = { ...source, date: to }

          if (toMonth === fromMonth) {
            qc.setQueryData<MealPlanEntry[]>(
              ['mealPlan', fromMonth],
              fromEntries.map((entry) => (entry.date === from ? movedSource : entry)),
            )
          } else {
            qc.setQueryData<MealPlanEntry[]>(
              ['mealPlan', fromMonth],
              fromEntries.filter((entry) => entry.date !== from),
            )
            qc.setQueryData<MealPlanEntry[]>(['mealPlan', toMonth], [...toEntries, movedSource])
          }
        }
      }

      return { previousFrom, previousTo, fromMonth, toMonth }
    },
    onError: (_error, _variables, context) => {
      if (!context) return
      if (context.previousFrom !== undefined) {
        qc.setQueryData(['mealPlan', context.fromMonth], context.previousFrom)
      }
      if (context.toMonth !== context.fromMonth && context.previousTo !== undefined) {
        qc.setQueryData(['mealPlan', context.toMonth], context.previousTo)
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['mealPlan'] })
    },
  })
}
