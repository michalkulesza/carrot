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
      className={`flex w-full flex-col gap-2.5 rounded-2xl border border-line bg-white p-3 ${className}`}
    >
      <div className="flex h-4 items-center">
        <div className="h-2.5 w-28 animate-pulse rounded bg-zinc-200" />
      </div>
      <div className="h-[132px] w-full animate-pulse rounded-xl bg-zinc-200" />
      <div className="flex flex-col gap-0.5">
        <div className="flex h-[19px] items-center">
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-zinc-200" />
        </div>
        <div className="flex h-4 items-center">
          <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-200" />
        </div>
      </div>
    </div>
  )
}

export default NextMealCardSkeleton
