import { useTranslation } from 'react-i18next'

interface HouseholdButtonSkeletonProps {
  collapsed: boolean
}

// Same box model as the sidebar's household switcher button so the nav below
// doesn't shift when households finish loading.
const HouseholdButtonSkeleton = ({
  collapsed,
}: HouseholdButtonSkeletonProps) => {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      aria-label={t('common.loading')}
      className="flex items-center justify-start gap-2 px-3 py-2 mb-3 w-full"
    >
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-zinc-200" />
      {!collapsed && (
        <span className="flex h-4 min-w-0 flex-1 items-center">
          <span className="h-3 w-28 animate-pulse rounded bg-zinc-200" />
        </span>
      )}
    </div>
  )
}

export default HouseholdButtonSkeleton
