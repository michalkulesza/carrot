import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@carrot/shared/api/client'
import type { AuthUser, ImportJob } from '@carrot/shared/types'
import { buildOptimisticImportJob, buildOptimisticJobId } from '@carrot/shared/utils/optimisticImportJob'
import { createUuid } from './uuid'

const queryKey = ['importJobs']

export const enqueueImport = async (
  api: ApiClient,
  qc: QueryClient,
  kind: 'url' | 'text' | 'image',
  input: Record<string, string>,
  author?: AuthUser | null,
): Promise<ImportJob> => {
  const idempotencyKey = createUuid()
  const placeholderId = buildOptimisticJobId(idempotencyKey)
  const placeholder = buildOptimisticImportJob({
    id: placeholderId,
    kind,
    sourceUrl: kind === 'url' ? input.url ?? null : null,
    userId: author?.id ?? '',
    userName: author?.nickname ?? null,
  })

  qc.setQueryData<ImportJob[]>(queryKey, (jobs = []) => [...jobs, placeholder])

  let job: ImportJob
  try {
    job = await api.enqueueImportJob({ kind, input, idempotency_key: idempotencyKey })
  } catch (error) {
    qc.setQueryData<ImportJob[]>(queryKey, (jobs = []) => jobs.filter((item) => item.id !== placeholderId))
    throw error
  }

  qc.setQueryData<ImportJob[]>(queryKey, (jobs = []) => [
    ...jobs.filter((item) => item.id !== placeholderId && item.id !== job.id),
    job,
  ])

  return job
}
