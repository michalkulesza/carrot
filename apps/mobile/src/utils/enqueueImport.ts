import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@carrot/shared/api/client'
import type { ImportJob } from '@carrot/shared/types'
import { createUuid } from './uuid'
import { setImportImagePreview } from './importImagePreviews'
import { resolveRecipePreview } from './recipePreview'

export const enqueueImport = async (
  api: ApiClient,
  qc: QueryClient,
  kind: 'url' | 'text' | 'image',
  input: Record<string, string>,
): Promise<ImportJob> => {
  const job = await api.enqueueImportJob({ kind, input, idempotency_key: createUuid() })

  if (kind === 'image' && input.image_base64) {
    setImportImagePreview(job.id, `data:${input.mime_type ?? 'image/jpeg'};base64,${input.image_base64}`)
  }

  qc.setQueryData<ImportJob[]>(['importJobs'], (jobs = []) => [...jobs.filter((item) => item.id !== job.id), job])

  if (kind === 'url') {
    void resolveRecipePreview(input.url).then((previewUrl) => {
      if (!previewUrl) return
      setImportImagePreview(job.id, previewUrl)
      qc.setQueryData<ImportJob[]>(['importJobs'], (jobs = []) => [...jobs])
    })
  }

  return job
}
