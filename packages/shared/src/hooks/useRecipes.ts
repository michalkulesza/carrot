import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import type { RecipeOut, RecipeSaveRequest } from '../types'

export const useRecipes = (enabled = true) => {
  const api = useApiClient()
  const qc = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    return api.subscribeRecipes(() => qc.invalidateQueries({ queryKey: ['recipes'] }))
  }, [api, qc, enabled])

  const query = useQuery({ queryKey: ['recipes'], queryFn: api.listRecipes, enabled })

  const create = useMutation({
    mutationFn: api.saveRecipe,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RecipeSaveRequest }) =>
      api.updateRecipe(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })

  const remove = useMutation({
    mutationFn: api.deleteRecipe,
    onSuccess: (_, id) => {
      qc.setQueryData<RecipeOut[]>(['recipes'], (old) => old?.filter((r) => r.id !== id) ?? [])
      return qc.invalidateQueries({ queryKey: ['recipes'] })
    },
  })

  const reorder = useMutation({
    mutationFn: api.reorderRecipes,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })

  const toggleFavourite = useMutation({
    mutationFn: api.toggleFavourite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })

  const importCsv = useMutation({
    mutationFn: api.importRecipes,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })

  const linkToHousehold = useMutation({
    mutationFn: ({ id, householdId }: { id: string; householdId?: string }) =>
      api.linkRecipeToHousehold(id, householdId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })

  const linkToPersonal = useMutation({
    mutationFn: api.linkRecipeToPersonal,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })

  return {
    recipes: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    create,
    update,
    remove,
    reorder,
    toggleFavourite,
    importCsv,
    linkToHousehold,
    linkToPersonal,
  }
}

export const useRecipeStats = () => {
  const api = useApiClient()
  return useQuery({ queryKey: ['recipes', 'stats'], queryFn: api.fetchStats })
}

export const usePersonalRecipes = (enabled = true) => {
  const api = useApiClient()
  return useQuery({ queryKey: ['recipes', 'personal'], queryFn: api.listPersonalRecipes, enabled })
}
