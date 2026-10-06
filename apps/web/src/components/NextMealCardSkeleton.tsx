import { useTranslation } from 'react-i18next'

interface NextMealCardSkeletonProps {
  compact?: boolean
  className?: string
}

// Mirrors NextMealCard's loaded layout line for line so the sidebar keeps its
// height when the real card replaces it.
const NextMealCardSkeleton = ({
  compact = false,
  className = '',
}: NextMealCardSkeletonProps) => {
  const { t } = useTranslation()

  if (compact) {
    return (
      <div
        role="status"
        aria-label={t('common.loading')}
        className={`flex min-h-11 w-full items-center justify-center rounded-xl p-2.5 ${className}`}
      >
        <div className="h-5 w-5 animate-pulse rounded bg-zinc-200" />
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-label={t('common.loading')}
      className={`w-full rounded-xl border border-zinc-200 bg-white p-3 ${className}`}
    >
      <div className="mb-2 flex h-4 items-center">
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-zinc-200" />
        <div className="min-w-0 flex-1">
          <div className="flex h-5 items-center">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-zinc-200" />
          </div>
          <div className="mt-0.5 flex h-4 items-center">
            <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-200" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default NextMealCardSkeleton
