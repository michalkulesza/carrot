import { useRef, useState } from 'react'
import { useApiClient } from '@carrot/shared/api/context'
import type { ImportJob } from '@carrot/shared/types'
import ImportDuplicateModal from './ImportDuplicateModal'
import ImportJobCard from './ImportJobCard'
import ImportManualActionModal from './ImportManualActionModal'
import { isDuplicateImportFailure } from './helpers'

interface ImportJobCardsProps {
  jobs: ImportJob[]
  onRetry: (jobId: string) => Promise<unknown>
  onImportAnyway: (jobId: string) => Promise<unknown>
  onDismiss: (jobId: string) => Promise<unknown>
  onContinueManually: (sourceUrl: string | null) => void
  onOpenRecipe: (recipeId: string) => void
}

const ImportJobCards = ({
  jobs,
  onRetry,
  onImportAnyway,
  onDismiss,
  onContinueManually,
  onOpenRecipe,
}: ImportJobCardsProps) => {
  const api = useApiClient()
  const [actionJobId, setActionJobId] = useState<string | null>(null)
  const [attentionJob, setAttentionJob] = useState<ImportJob | null>(null)
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

  const closeAttentionModal = () => setAttentionJob(null)

  const handleRetry = (jobId: string) =>
    void runAction(jobId, () => onRetry(jobId))
  const handleDismiss = (jobId: string) =>
    void runAction(jobId, () => onDismiss(jobId))
  const handleCancel = (jobId: string) =>
    void runAction(jobId, () => api.cancelImportJob(jobId))

  const handleRemoveJob = () => {
    if (attentionJob) handleDismiss(attentionJob.id)
    closeAttentionModal()
  }

  const handleManualContinue = () => {
    if (attentionJob) onContinueManually(attentionJob.source_url)
    closeAttentionModal()
  }

  const handleDuplicateImportAnyway = () => {
    if (attentionJob)
      void runAction(attentionJob.id, () => onImportAnyway(attentionJob.id))
    closeAttentionModal()
  }

  const handleDuplicateGoToRecipe = () => {
    if (attentionJob?.duplicate_recipe_id)
      onOpenRecipe(attentionJob.duplicate_recipe_id)
    closeAttentionModal()
  }

  const hasJobs = jobs.length > 0
  const isDuplicateOpen =
    hasJobs && attentionJob !== null && isDuplicateImportFailure(attentionJob)
  const isManualOpen =
    hasJobs && attentionJob !== null && !isDuplicateImportFailure(attentionJob)

  return (
    <>
      <div className="mx-4 mt-4 md:mb-4 flex flex-col gap-2">
        {jobs.map((job) => (
          <ImportJobCard
            key={job.id}
            job={job}
            actionPending={actionJobId === job.id}
            onOpenAttention={setAttentionJob}
            onRetry={handleRetry}
            onDismiss={handleDismiss}
            onCancel={handleCancel}
          />
        ))}
      </div>
      <ImportManualActionModal
        isOpen={isManualOpen}
        onClose={closeAttentionModal}
        onRemove={handleRemoveJob}
        onContinue={handleManualContinue}
      />
      <ImportDuplicateModal
        isOpen={isDuplicateOpen}
        canGoToRecipe={Boolean(attentionJob?.duplicate_recipe_id)}
        onClose={closeAttentionModal}
        onDontImport={handleRemoveJob}
        onGoToRecipe={handleDuplicateGoToRecipe}
        onImportAnyway={handleDuplicateImportAnyway}
      />
    </>
  )
}

export default ImportJobCards
