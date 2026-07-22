import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'react-feather'
import { Button, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader } from '@heroui/react'
import { useApiClient } from '@carrot/shared/api/context'
import type { ImportJob } from '@carrot/shared/types'

const ImportJobCards = ({
  jobs,
  onRetry,
  onDismiss,
  onContinueManually,
}: {
  jobs: ImportJob[]
  onRetry: (jobId: string) => Promise<unknown>
  onDismiss: (jobId: string) => Promise<unknown>
  onContinueManually: (sourceUrl: string | null) => void
}) => {
  const { t } = useTranslation()
  const api = useApiClient()
  const [actionJobId, setActionJobId] = useState<string | null>(null)
  const [manualActionJob, setManualActionJob] = useState<ImportJob | null>(null)
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
    <>
    <div className="mx-4 mt-4 flex flex-col gap-2">
      {jobs.map((job) => {
        const actionPending = actionJobId === job.id
        const requiresUserAction = job.status === 'failed' && job.failure_code === 'user_action_required'
        const retryScheduled = job.status === 'pending' && job.retry_count > 0
        const message = job.status === 'running'
          ? t('importJobs.running')
          : job.status === 'failed'
            ? t(`importJobs.failure.${job.failure_code ?? 'unexpected'}`)
            : retryScheduled
              ? t('importJobs.takingLonger')
              : t('importJobs.pending')
        return (
          <div key={job.id} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${requiresUserAction ? 'border-warning-400 bg-warning-100' : 'border-zinc-200 bg-zinc-50'}`}>
            {job.status !== 'failed' && <span className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">{message}</p>
              <p className="text-xs text-zinc-500">{t(`recipes.extractingFrom_${job.kind}`)} · {job.created_by_name ?? t('importJobs.someone')}</p>
            </div>
            {requiresUserAction ? (
              <button type="button" className="p-2 text-warning-700" onClick={() => setManualActionJob(job)} aria-label={t('importJobs.userActionRequired.continue')}><ChevronRight size={20} /></button>
            ) : job.status === 'failed' ? (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" isDisabled={actionPending} onPress={() => void runAction(job.id, () => onRetry(job.id))}>{t('importJobs.retry')}</Button>
                <Button size="sm" variant="tertiary" isDisabled={actionPending} onPress={() => void runAction(job.id, () => onDismiss(job.id))}>{t('importJobs.dismiss')}</Button>
              </div>
            ) : (
              <Button size="sm" variant="tertiary" isDisabled={actionPending} onPress={() => void runAction(job.id, () => api.cancelImportJob(job.id))}>{t('importJobs.cancel')}</Button>
            )}
          </div>
        )
      })}
    </div>
    <Modal isOpen={manualActionJob !== null} onOpenChange={(open) => !open && setManualActionJob(null)}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm">
          <ModalDialog>
            <ModalHeader>{t('importJobs.userActionRequired.title')}</ModalHeader>
            <ModalBody>{t('importJobs.userActionRequired.body')}</ModalBody>
            <ModalFooter>
              <Button variant="tertiary" onPress={() => {
                if (manualActionJob) void runAction(manualActionJob.id, () => onDismiss(manualActionJob.id))
                setManualActionJob(null)
              }}>{t('common.remove')}</Button>
              <Button variant="primary" onPress={() => {
                onContinueManually(manualActionJob?.source_url ?? null)
                setManualActionJob(null)
              }}>{t('importJobs.userActionRequired.continue')}</Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
    </>
  )
}

export default ImportJobCards
