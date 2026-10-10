import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'

export const useLinkedRecipeImport = (recipeId: string) => {
  const api = useApiClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (url: string) => api.linkRecipeImport(recipeId, url),
    onSuccess: (result) => {
      if (result.recipe_id) void qc.invalidateQueries({ queryKey: ['recipes'] })
      else void qc.invalidateQueries({ queryKey: ['importJobs'] })
    },
  })
}
