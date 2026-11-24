import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'react-feather'
import { Button } from '@heroui/react'
import type { ImportJob } from '@carrot/shared/types'
import { getImportJobMessageKey, importJobNeedsAttention } from './helpers'

interface ImportJobCardProps {
  job: ImportJob
  actionPending: boolean
  onOpenAttention: (job: ImportJob) => void
  onRetry: (jobId: string) => void
  onDismiss: (jobId: string) => void
  onCancel: (jobId: string) => void
}

const ImportJobCard = ({
  job,
  actionPending,
  onOpenAttention,
  onRetry,
  onDismiss,
  onCancel,
}: ImportJobCardProps) => {
  const { t } = useTranslation()
  const needsAttention = importJobNeedsAttention(job)
  const message = t(getImportJobMessageKey(job))
  const cardClassName = needsAttention
    ? 'cursor-pointer border-warning-400 bg-warning-100'
    : 'border-zinc-200 bg-zinc-50'

  const handleOpenAttention = () => onOpenAttention(job)

  return (
    <div
      className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${cardClassName}`}
      onClick={needsAttention ? handleOpenAttention : undefined}
    >
      {job.status !== 'failed' && (
        <span className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{message}</p>
        <p className="truncate text-xs text-zinc-500">
          {job.kind === 'url' && job.source_url ? (
            <a
              href={job.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {job.source_url}
            </a>
          ) : (
            t(`recipes.extractingFrom_${job.kind}`)
          )}{' '}
          · {job.created_by_name ?? t('importJobs.someone')}
        </p>
      </div>
      {needsAttention ? (
        <button
          type="button"
          className="p-2 text-warning-700"
          onClick={handleOpenAttention}
          aria-label={t('importJobs.userActionRequired.continue')}
        >
          <AlertCircle size={20} />
        </button>
      ) : job.status === 'failed' ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            isDisabled={actionPending}
            onPress={() => onRetry(job.id)}
          >
            {t('importJobs.retry')}
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            isDisabled={actionPending}
            onPress={() => onDismiss(job.id)}
          >
            {t('importJobs.remove')}
          </Button>
        </div>
      ) : (
        <div>
          <Button
            size="sm"
            variant="tertiary"
            isDisabled={actionPending}
            onPress={() => onCancel(job.id)}
          >
            {t('importJobs.cancel')}
          </Button>
        </div>
      )}
    </div>
  )
}

export default ImportJobCard
