import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import type { UserPreferences } from '../types'

export const usePreferences = () => {
  const api = useApiClient()
  const qc = useQueryClient()

  const query = useQuery({ queryKey: ['preferences'], queryFn: api.getPreferences })

  const update = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => api.updatePreferences(data),
    onSuccess: (updated) => qc.setQueryData(['preferences'], updated),
  })

  return {
    preferences: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    update,
  }
}

export const useRecipeServingPreference = (
  recipeId: string | undefined,
  originalServings: number | null,
) => {
  const api = useApiClient()
  const queryClient = useQueryClient()
  const { preferences } = usePreferences()
  const preferredServings = recipeId
    ? preferences?.recipe_serving_overrides?.[recipeId]
    : undefined
  const [selectedServings, setSelectedServings] = useState<number | null>(
    preferredServings ?? originalServings,
  )
  const pendingServingsRef = useRef<number | null>(null)
  const isSavingRef = useRef(false)

  useEffect(() => {
    if (pendingServingsRef.current !== null) return
    setSelectedServings(preferredServings ?? originalServings)
  }, [recipeId, originalServings, preferredServings])

  const savePendingServings = useCallback(async () => {
    if (!recipeId || isSavingRef.current || pendingServingsRef.current === null) return

    const servings = pendingServingsRef.current
    isSavingRef.current = true
    try {
      const updated = await api.updateRecipeServingPreference(recipeId, servings)
      queryClient.setQueryData(['preferences'], updated)
    } catch {} finally {
      isSavingRef.current = false
      if (pendingServingsRef.current !== servings) {
        void savePendingServings()
      } else {
        pendingServingsRef.current = null
      }
    }
  }, [api, queryClient, recipeId])

  const setServings = useCallback(
    (servings: number) => {
      setSelectedServings(servings)
      pendingServingsRef.current = servings
      void savePendingServings()
    },
    [savePendingServings],
  )

  return { selectedServings, setServings }
}
