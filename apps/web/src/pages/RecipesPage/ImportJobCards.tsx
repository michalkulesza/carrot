import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@heroui/react'
import { useApiClient } from '@carrot/shared/api/context'
import type { ImportJob } from '@carrot/shared/types'

const ImportJobCards = ({ jobs }: { jobs: ImportJob[] }) => {
  const { t } = useTranslation()
  const api = useApiClient()
  const [actionJobId, setActionJobId] = useState<string | null>(null)
  const actionInProgress = useRef(false)

  const runAction = async (jobId: string, action: () => Promise<unknown>) => {
    if (actionInProgress.current) return
    actionInProgress.current = true
    setActionJobId(jobId)
    try {
      await action()
    } catch {
      // The existing import-job stream keeps the card available for a retry.
    } finally {
      actionInProgress.current = false
      setActionJobId(null)
    }
  }

  if (!jobs.length) return null

  return (
    <div className="mx-4 mt-4 flex flex-col gap-2">
      {jobs.map((job) => {
        const actionPending = actionJobId === job.id
        const retryScheduled = job.status === 'pending' && job.retry_count > 0
        const message = job.status === 'running'
          ? t('importJobs.running')
          : job.status === 'failed'
            ? t(`importJobs.failure.${job.failure_code ?? 'unexpected'}`)
            : retryScheduled
              ? t('importJobs.takingLonger')
              : t('importJobs.pending')
        return (
          <div key={job.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 flex items-center gap-3">
            {job.status !== 'failed' && <span className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{message}</p>
              <p className="text-xs text-zinc-500">{t(`recipes.extractingFrom_${job.kind}`)} · {job.created_by_name ?? t('importJobs.someone')}</p>
            </div>
            {job.status === 'failed' ? (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" isDisabled={actionPending} onPress={() => void runAction(job.id, () => api.retryImportJob(job.id))}>{t('importJobs.retry')}</Button>
                <Button size="sm" variant="tertiary" isDisabled={actionPending} onPress={() => void runAction(job.id, () => api.dismissImportJob(job.id))}>{t('importJobs.dismiss')}</Button>
              </div>
            ) : (
              <Button size="sm" variant="tertiary" isDisabled={actionPending} onPress={() => void runAction(job.id, () => api.cancelImportJob(job.id))}>{t('importJobs.cancel')}</Button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ImportJobCards
