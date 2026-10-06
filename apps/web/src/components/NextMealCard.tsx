import { useCallback } from 'react'
import { Calendar, ChevronRight } from 'react-feather'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useNextMealPlanEntry } from '@carrot/shared/hooks/useNextMealPlanEntry'
import { formatNextMealDate } from '@carrot/shared/utils/dateUtils'
import NetworkImage from './NetworkImage'
import NextMealCardSkeleton from './NextMealCardSkeleton'
import { proxyUrl } from '../utils/imageUtils'
import { useRouteNavigation } from '../routing/RouteNavigationContext'

interface NextMealCardProps {
  compact?: boolean
  className?: string
}

const NextMealCard = ({
  compact = false,
  className = '',
}: NextMealCardProps) => {
  const navigate = useNavigate()
  const { openRecipe: openRecipeRoute } = useRouteNavigation()
  const { t, i18n } = useTranslation()
  const { entry, todayIso, isLoading, error, refetch } = useNextMealPlanEntry()

  const openMealPlan = useCallback(() => navigate('/plan'), [navigate])
  const openRecipe = useCallback(() => {
    if (!entry?.recipe) {
      openMealPlan()

      return
    }

    openRecipeRoute(entry.recipe.id)
  }, [entry, openMealPlan, openRecipeRoute])
  const handleRetry = useCallback(() => void refetch(), [refetch])

  if (isLoading) {
    return <NextMealCardSkeleton compact={compact} className={className} />
  }

  if (compact) {
    const label = error
      ? t('nextMeal.error')
      : entry
        ? `${t('nextMeal.title')}: ${entry.recipe?.title ?? entry.text}`
        : t('nextMeal.openPlan')
    const handleClick = error ? handleRetry : entry ? openRecipe : openMealPlan

    return (
      <button
        type="button"
        onClick={handleClick}
        title={label}
        aria-label={label}
        className={`flex min-h-11 w-full items-center justify-center rounded-xl p-2.5 text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 ${className}`}
      >
        <Calendar size={20} />
      </button>
    )
  }

  if (error) {
    return (
      <div
        className={`rounded-xl border border-red-200 bg-red-50 p-3 ${className}`}
      >
        <p className="text-sm font-medium text-red-800">
          {t('nextMeal.error')}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="mt-2 min-h-11 text-sm font-semibold text-red-700 underline underline-offset-2"
        >
          {t('nextMeal.retry')}
        </button>
      </div>
    )
  }

  if (!entry) {
    return (
      <button
        type="button"
        onClick={openMealPlan}
        className={`flex min-h-24 w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left transition-colors hover:bg-zinc-50 ${className}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Calendar size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-zinc-900">
            {t('nextMeal.empty')}
          </span>
          <span className="mt-0.5 block text-xs font-medium text-primary">
            {t('nextMeal.openPlan')}
          </span>
        </span>
        <ChevronRight
          size={18}
          className="shrink-0 text-zinc-400"
          aria-hidden="true"
        />
      </button>
    )
  }

  const dateLabel = formatNextMealDate(
    entry.date,
    todayIso,
    i18n.language,
    t('nextMeal.today'),
    t('nextMeal.tomorrow')
  )
  const entryTitle = entry.recipe?.title ?? entry.text ?? ''
  const thumbnailSrc = entry.recipe
    ? proxyUrl(entry.recipe.thumbnail_url)
    : null

  return (
    <button
      type="button"
      onClick={openRecipe}
      className={`w-full rounded-xl border border-zinc-200 bg-white p-3 text-left transition-colors hover:bg-zinc-50 ${className}`}
      aria-label={`${t('nextMeal.title')}: ${entryTitle}, ${dateLabel}`}
    >
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t('nextMeal.title')}
      </span>
      <span className="flex min-w-0 items-center gap-3">
        {thumbnailSrc ? (
          <NetworkImage
            src={thumbnailSrc}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Calendar size={20} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-zinc-900">
            {entryTitle}
          </span>
          <span className="mt-0.5 block text-xs text-zinc-500">
            {dateLabel}
          </span>
        </span>
        <ChevronRight
          size={18}
          className="shrink-0 text-zinc-400"
          aria-hidden="true"
        />
      </span>
    </button>
  )
}

export default NextMealCard
