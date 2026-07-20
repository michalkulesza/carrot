import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import type { RecipeOut, RecipeSaveRequest } from '../types'

type RecipeStreamApi = {
  subscribeRecipes: (onChange: () => void) => () => void
}

const recipeChangeListeners = new Set<() => void>()
let stopRecipeStream: (() => void) | null = null

const subscribeToRecipeChanges = (api: RecipeStreamApi, listener: () => void) => {
  recipeChangeListeners.add(listener)
  if (!stopRecipeStream) {
    stopRecipeStream = api.subscribeRecipes(() => {
      recipeChangeListeners.forEach((onChange) => onChange())
    })
  }

  return () => {
    recipeChangeListeners.delete(listener)
    if (recipeChangeListeners.size === 0) {
      stopRecipeStream?.()
      stopRecipeStream = null
    }
  }
}

export const useRecipes = (enabled = true) => {
  const api = useApiClient()
  const qc = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    return subscribeToRecipeChanges(api, () => void qc.invalidateQueries({ queryKey: ['recipes'] }))
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

export const useSemanticRecipeSearch = (query: string, scopeKey: string | null) => {
  const api = useApiClient()
  const normalizedQuery = query.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  const [debouncedQuery, setDebouncedQuery] = useState(normalizedQuery)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(normalizedQuery), 350)
    return () => clearTimeout(timer)
  }, [normalizedQuery])

  const enabled = Boolean(scopeKey && debouncedQuery.length >= 3)
  const search = useQuery({
    queryKey: ['recipes', 'semantic-search', scopeKey, debouncedQuery],
    queryFn: ({ signal }) => api.searchRecipes(debouncedQuery, signal),
    enabled,
    retry: false,
  })

  return {
    semanticRecipes: search.data ?? [],
    isSemanticLoading: normalizedQuery.length >= 3 && (normalizedQuery !== debouncedQuery || search.isFetching),
  }
}

export const usePersonalRecipes = (enabled = true) => {
  const api = useApiClient()
  return useQuery({ queryKey: ['recipes', 'personal'], queryFn: api.listPersonalRecipes, enabled })
}
