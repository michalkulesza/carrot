import { useCallback, useRef } from 'react'
import * as Haptics from 'expo-haptics'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import type { MealPlanEntry } from '@carrot/shared/types'
import { toISODate } from '@carrot/shared/utils/dateUtils'
import type { RecipePickerHandle } from '../components/RecipePicker'

export const usePlanMealForDate = () => {
  const api = useApiClient()
  const qc = useQueryClient()
  const pickerRef = useRef<RecipePickerHandle>(null)
  const dateRef = useRef<Date | null>(null)

  const setEntry = useMutation({
    mutationFn: ({ date, recipeId, text }: { date: string; recipeId?: string; text?: string }) =>
      api.setMealPlanEntry(date, { recipeId, text }),
    onSuccess: (entry) => {
      const todayIso = toISODate(new Date())
      if (entry.date >= todayIso) {
        qc.setQueryData<MealPlanEntry | null>(['mealPlan', 'next', todayIso], (current) => {
          if (current === null || current === undefined || entry.date <= current.date) return entry
          return current
        })
      }
      void qc.invalidateQueries({ queryKey: ['mealPlan'] })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    },
  })

  const deleteEntry = useMutation({
    mutationFn: api.deleteMealPlanEntry,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mealPlan'] }),
  })

  const openForDate = useCallback((date: Date) => {
    dateRef.current = date
    pickerRef.current?.present()
  }, [])

  const save = useCallback(
    (payload: { recipeId?: string; text?: string }) => {
      const date = dateRef.current
      if (!date || setEntry.isPending) return

      dateRef.current = null
      setEntry.mutate({ date: toISODate(date), ...payload })
      pickerRef.current?.dismiss()
    },
    [setEntry],
  )

  const handlePick = useCallback((recipeId: string) => save({ recipeId }), [save])

  const handleAddText = useCallback((text: string) => save({ text }), [save])

  const handleRemove = useCallback(() => {
    const date = dateRef.current
    if (!date || deleteEntry.isPending) return

    dateRef.current = null
    deleteEntry.mutate(toISODate(date))
    pickerRef.current?.dismiss()
  }, [deleteEntry])

  const handleClose = useCallback(() => {
    dateRef.current = null
  }, [])

  return { pickerRef, openForDate, handlePick, handleAddText, handleRemove, handleClose }
}
