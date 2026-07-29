import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'

type MealPlanStreamApi = {
  subscribeMealPlan: (onChange: () => void) => () => void
}

const mealPlanChangeListeners = new Set<() => void>()
let stopMealPlanStream: (() => void) | null = null

const subscribeToMealPlanChanges = (api: MealPlanStreamApi, listener: () => void) => {
  mealPlanChangeListeners.add(listener)
  if (!stopMealPlanStream) {
    stopMealPlanStream = api.subscribeMealPlan(() => {
      mealPlanChangeListeners.forEach((onChange) => onChange())
    })
  }

  return () => {
    mealPlanChangeListeners.delete(listener)
    if (mealPlanChangeListeners.size === 0) {
      stopMealPlanStream?.()
      stopMealPlanStream = null
    }
  }
}

export const useMealPlanStream = () => {
  const api = useApiClient()
  const qc = useQueryClient()

  useEffect(() => {
    return subscribeToMealPlanChanges(api, () => void qc.invalidateQueries({ queryKey: ['mealPlan'] }))
  }, [api, qc])
}
