import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import type { RecipeOut } from '../types'

export const useRelatedRecipes = (recipeId: string | null) => {
  const api = useApiClient()
  const qc = useQueryClient()
  const queryKey = ['recipes', recipeId, 'related'] as const
  const query = useQuery({
    queryKey,
    queryFn: () => api.listRelatedRecipes(recipeId!),
    enabled: recipeId !== null,
    refetchOnMount: 'always',
  })
  const save = useMutation({
    mutationFn: (recipeIds: string[]) => api.setRelatedRecipes(recipeId!, recipeIds),
    onSuccess: (related) => {
      qc.setQueryData<RecipeOut[]>(queryKey, related)
      void qc.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
  return { relatedRecipes: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch, save }
}
