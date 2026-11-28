import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import { getErrorStatus } from '../api/errors'
import type { RecipeOut, RecipeSaveRequest } from '../types'
import { mealPlanDataReferencesRecipe, removeRecipeById, upsertRecipe } from '../utils/recipeCache'

type RecipeStreamApi = {
  subscribeRecipes: (onChange: (recipeId: string | null) => void) => () => void
  fetchRecipe: (id: string) => Promise<RecipeOut>
}

const COALESCE_DELAY_MS = 300
const COALESCE_MAX_WAIT_MS = 2000
const MAX_PATCHED_IDS = 10

let recipeStreamSubscribers = 0
let stopRecipeStream: (() => void) | null = null
let pendingIds = new Set<string>()
let pendingHasIdlessEvent = false
let firstPendingAt = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null

const recipeDetailFilter = (id: string) => ({
  queryKey: ['recipes', 'detail'],
  predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[3] === id,
})

const sameHouseholds = (a: string[] | undefined, b: string[] | undefined) => {
  const left = [...(a ?? [])].sort()
  const right = [...(b ?? [])].sort()
  return left.length === right.length && left.every((id, i) => id === right[i])
}

const patchRecipeList = async (api: RecipeStreamApi, qc: QueryClient, ids: string[]) => {
  let membershipChanged = false

  await Promise.all(
    ids.map(async (id) => {
      try {
        const recipe = await api.fetchRecipe(id)
        const cached = qc.getQueryData<RecipeOut[]>(['recipes'])?.find((item) => item.id === id)
        if (!cached || !sameHouseholds(cached.household_ids, recipe.household_ids)) membershipChanged = true
        qc.setQueryData<RecipeOut[]>(['recipes'], (old) => upsertRecipe(old, recipe))
        qc.setQueriesData<RecipeOut>(recipeDetailFilter(id), recipe)
      } catch (error) {
        if (getErrorStatus(error) !== 404) throw error
        membershipChanged = true
        qc.setQueryData<RecipeOut[]>(['recipes'], (old) => removeRecipeById(old, id))
        void qc.invalidateQueries(recipeDetailFilter(id))
      }
    })
  )

  return membershipChanged
}

const flushRecipeChanges = async (api: RecipeStreamApi, qc: QueryClient) => {
  const ids = pendingIds
  const hasIdlessEvent = pendingHasIdlessEvent
  pendingIds = new Set()
  pendingHasIdlessEvent = false
  firstPendingAt = 0
  flushTimer = null

  let householdsAffected = true
  const needsFullRefetch = hasIdlessEvent || ids.size > MAX_PATCHED_IDS
  if (needsFullRefetch) {
    void qc.invalidateQueries({ queryKey: ['recipes'] })
  } else {
    try {
      householdsAffected = await patchRecipeList(api, qc, [...ids])
    } catch {
      void qc.invalidateQueries({ queryKey: ['recipes'] })
    }
  }

  if (householdsAffected) void qc.invalidateQueries({ queryKey: ['households'] })

  const mealPlanAffected = qc
    .getQueriesData({ queryKey: ['mealPlan'] })
    .some(([, data]) => mealPlanDataReferencesRecipe(data, ids))
  if (hasIdlessEvent || mealPlanAffected) {
    void qc.invalidateQueries({ queryKey: ['mealPlan'] })
  }
}

const enqueueRecipeChange = (api: RecipeStreamApi, qc: QueryClient, recipeId: string | null) => {
  if (recipeId) pendingIds.add(recipeId)
  else pendingHasIdlessEvent = true

  const now = Date.now()
  if (!firstPendingAt) firstPendingAt = now
  if (flushTimer) clearTimeout(flushTimer)

  const delay = Math.min(COALESCE_DELAY_MS, firstPendingAt + COALESCE_MAX_WAIT_MS - now)
  flushTimer = setTimeout(() => void flushRecipeChanges(api, qc), Math.max(0, delay))
}

const subscribeToRecipeChanges = (api: RecipeStreamApi, qc: QueryClient) => {
  recipeStreamSubscribers += 1
  if (!stopRecipeStream) {
    stopRecipeStream = api.subscribeRecipes((recipeId) => enqueueRecipeChange(api, qc, recipeId))
  }

  return () => {
    recipeStreamSubscribers -= 1
    if (recipeStreamSubscribers === 0) {
      stopRecipeStream?.()
      stopRecipeStream = null
    }
  }
}

export const useRecipes = (enabled = true, staleTime?: number) => {
  const api = useApiClient()
  const qc = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    return subscribeToRecipeChanges(api, qc)
  }, [api, qc, enabled])

  const query = useQuery({ queryKey: ['recipes'], queryFn: api.listRecipes, enabled, staleTime })

  const invalidateRecipesAndHouseholds = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['recipes'] }),
      qc.invalidateQueries({ queryKey: ['households'] }),
    ])

  const create = useMutation({
    mutationFn: api.saveRecipe,
    onSuccess: invalidateRecipesAndHouseholds,
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
      return invalidateRecipesAndHouseholds()
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

  const dismissIssue = useMutation({
    mutationFn: ({ id, issueCode }: { id: string; issueCode: string }) =>
      api.dismissRecipeIssue(id, issueCode),
    onSuccess: (updated) => {
      qc.setQueryData<RecipeOut[]>(['recipes'], (old) => old?.map((recipe) => recipe.id === updated.id ? updated : recipe) ?? [])
      void qc.invalidateQueries({ queryKey: ['recipes'] })
    },
  })

  const importCsv = useMutation({
    mutationFn: api.importRecipes,
    onSuccess: invalidateRecipesAndHouseholds,
  })

  const setHouseholds = useMutation({
    mutationFn: ({ id, householdIds }: { id: string; householdIds: string[] }) =>
      api.setRecipeHouseholds(id, householdIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] })
      qc.invalidateQueries({ queryKey: ['recipes', 'mine'] })
      qc.invalidateQueries({ queryKey: ['households'] })
    },
  })

  const removeFromHousehold = useMutation({
    mutationFn: ({ id, householdId }: { id: string; householdId: string }) =>
      api.removeRecipeFromHousehold(id, householdId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] })
      qc.invalidateQueries({ queryKey: ['recipes', 'mine'] })
      qc.invalidateQueries({ queryKey: ['households'] })
    },
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
    dismissIssue,
    importCsv,
    setHouseholds,
    removeFromHousehold,
  }
}

export const useDismissRecipeIssue = () => {
  const api = useApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, issueCode }: { id: string; issueCode: string }) => api.dismissRecipeIssue(id, issueCode),
    onSuccess: (updated) => {
      qc.setQueryData<RecipeOut[]>(['recipes'], (old) => old?.map((recipe) => recipe.id === updated.id ? updated : recipe) ?? [])
      void qc.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export const useRecipeStats = (enabled = true) => {
  const api = useApiClient()
  return useQuery({ queryKey: ['recipes', 'stats'], queryFn: api.fetchStats, enabled })
}

export const useRecipe = (
  id: string | null,
  scopeKey: string | null,
  initialRecipe?: RecipeOut
) => {
  const api = useApiClient()

  return useQuery({
    queryKey: ['recipes', 'detail', scopeKey, id],
    queryFn: () => api.fetchRecipe(id!),
    enabled: Boolean(id && scopeKey),
    initialData: initialRecipe,
    retry: false,
  })
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
    placeholderData: keepPreviousData,
  })

  return {
    semanticRecipes: enabled ? search.data ?? [] : [],
    isSemanticLoading: normalizedQuery.length >= 3 && (normalizedQuery !== debouncedQuery || search.isFetching),
  }
}

export const useMyRecipes = (enabled = true) => {
  const api = useApiClient()
  return useQuery({ queryKey: ['recipes', 'mine'], queryFn: api.listMyRecipes, enabled })
}
