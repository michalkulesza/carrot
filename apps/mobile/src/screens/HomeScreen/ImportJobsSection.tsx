import { memo, useCallback } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ImportJob } from '@carrot/shared/types'
import { MarqueeSyncProvider } from '../../components/MarqueeSync'
import { dismissPresentedByCollapseId } from '../../lib/presentedNotifications'
import PendingJobCard from './PendingJobCard'
import { styles } from './styles'

type JobMutation = { mutateAsync: (jobId: string) => Promise<unknown> }

interface JobActions {
  retry: JobMutation
  importAnyway: JobMutation
  cancel: JobMutation
  dismiss: JobMutation
  onGoToRecipe: (recipeId: string) => void
  onContinueManually: (sourceUrl: string | null) => void
}

const clearAfter = async (action: Promise<unknown>, jobId: string) => {
  await action
  void dismissPresentedByCollapseId(`import:${jobId}`)
}

const ImportJobRow = ({ job, actions }: { job: ImportJob; actions: JobActions }) => {
  const { retry, importAnyway, cancel, dismiss, onGoToRecipe, onContinueManually } = actions

  const handleRetry = useCallback(() => clearAfter(retry.mutateAsync(job.id), job.id), [retry, job.id])
  const handleImportAnyway = useCallback(
    () => clearAfter(importAnyway.mutateAsync(job.id), job.id),
    [importAnyway, job.id],
  )
  const handleCancel = useCallback(() => clearAfter(cancel.mutateAsync(job.id), job.id), [cancel, job.id])
  const handleDismiss = useCallback(() => clearAfter(dismiss.mutateAsync(job.id), job.id), [dismiss, job.id])
  const handleContinueManually = useCallback(() => onContinueManually(job.source_url), [onContinueManually, job.source_url])

  return (
    <PendingJobCard
      job={job}
      onRetry={handleRetry}
      onImportAnyway={handleImportAnyway}
      onGoToRecipe={onGoToRecipe}
      onCancel={handleCancel}
      onDismiss={handleDismiss}
      onContinueManually={handleContinueManually}
    />
  )
}

interface ImportJobsSectionProps extends JobActions {
  jobs: ImportJob[]
}

const ImportJobsSection = ({ jobs, ...actions }: ImportJobsSectionProps) => {
  const { t } = useTranslation()

  if (jobs.length === 0) return null

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('home.importsInProgress')}
        </Text>
      </View>
      <MarqueeSyncProvider>
        {jobs.map((job) => (
          <ImportJobRow key={job.id} job={job} actions={actions} />
        ))}
      </MarqueeSyncProvider>
    </View>
  )
}

export default memo(ImportJobsSection)
