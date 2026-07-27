import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'

export const useTags = (enabled = true) => {
  const api = useApiClient()
  const qc = useQueryClient()

  const query = useQuery({ queryKey: ['tags'], queryFn: api.listTags, enabled })

  const create = useMutation({
    mutationFn: api.createTag,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  })

  const addToRecipe = useMutation({
    mutationFn: ({ recipeId, tagId }: { recipeId: string; tagId: string }) =>
      api.addTagToRecipe(recipeId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })

  const removeFromRecipe = useMutation({
    mutationFn: ({ recipeId, tagId }: { recipeId: string; tagId: string }) =>
      api.removeTagFromRecipe(recipeId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })

  return {
    tags: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create,
    addToRecipe,
    removeFromRecipe,
  }
}
