import type { ImportJob, ImportJobKind } from '../types'

const OPTIMISTIC_JOB_ID_PREFIX = 'optimistic-'

export const isOptimisticJobId = (jobId: string): boolean => jobId.startsWith(OPTIMISTIC_JOB_ID_PREFIX)

export const buildOptimisticJobId = (idempotencyKey: string): string => `${OPTIMISTIC_JOB_ID_PREFIX}${idempotencyKey}`

export const buildOptimisticImportJob = ({
  id,
  kind,
  sourceUrl,
  userId,
  userName,
}: {
  id: string
  kind: ImportJobKind
  sourceUrl: string | null
  userId: string
  userName: string | null
}): ImportJob => {
  const now = new Date().toISOString()
  return {
    id,
    status: 'pending',
    kind,
    source_url: sourceUrl,
    household_id: null,
    created_by_user_id: userId,
    created_by_name: userName,
    result_recipe_id: null,
    duplicate_recipe_id: null,
    failure_code: null,
    failure_stage: null,
    outcome: null,
    retry_count: 0,
    next_attempt_at: null,
    device_capture_eligible: false,
    created_at: now,
    updated_at: now,
  }
}

export const isPlaceholderFor = (placeholder: ImportJob, job: ImportJob): boolean =>
  isOptimisticJobId(placeholder.id) &&
  placeholder.kind === job.kind &&
  placeholder.source_url === job.source_url &&
  placeholder.created_by_user_id === job.created_by_user_id
