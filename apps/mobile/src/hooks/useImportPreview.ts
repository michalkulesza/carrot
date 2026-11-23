import { useQuery, type QueryClient } from '@tanstack/react-query'
import { resolveRecipePreview } from '../utils/recipePreview'

const FOUND_STALE_TIME_MS = 7 * 24 * 60 * 60 * 1000
const MISSING_STALE_TIME_MS = 60 * 60 * 1000

export const importPreviewQueryOptions = (sourceUrl: string) => ({
  queryKey: ['importPreview', sourceUrl] as const,
  queryFn: () => resolveRecipePreview(sourceUrl),
  staleTime: (query: { state: { data: string | null | undefined } }) =>
    query.state.data ? FOUND_STALE_TIME_MS : MISSING_STALE_TIME_MS,
  gcTime: FOUND_STALE_TIME_MS,
  retry: false,
})

export const prefetchImportPreview = (queryClient: QueryClient, sourceUrl: string) =>
  queryClient.prefetchQuery(importPreviewQueryOptions(sourceUrl))

export const useImportPreview = (sourceUrl: string | null, enabled: boolean): string | null => {
  const { data } = useQuery({
    ...importPreviewQueryOptions(sourceUrl ?? ''),
    enabled: enabled && Boolean(sourceUrl),
  })
  return data ?? null
}
