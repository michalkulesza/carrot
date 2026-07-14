import { useCallback } from 'react'
import { Calendar, ChevronRight } from 'react-feather'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useNextMealPlanEntry } from '@carrot/shared/hooks/useNextMealPlanEntry'
import { formatNextMealDate } from '@carrot/shared/utils/dateUtils'
import NetworkImage from './NetworkImage'
import { proxyUrl } from '../utils/imageUtils'

interface NextMealCardProps {
  compact?: boolean
  className?: string
}

const NextMealCard = ({
  compact = false,
  className = '',
}: NextMealCardProps) => {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { entry, todayIso, isLoading, error, refetch } = useNextMealPlanEntry()

  const openMealPlan = useCallback(() => navigate('/plan'), [navigate])
  const openRecipe = useCallback(() => {
    if (!entry) return
    navigate(`/?recipe=${encodeURIComponent(entry.recipe.id)}`)
  }, [entry, navigate])
  const handleRetry = useCallback(() => void refetch(), [refetch])

  if (compact) {
    const label = error
      ? t('nextMeal.error')
      : entry
        ? `${t('nextMeal.title')}: ${entry.recipe.title}`
        : t('nextMeal.openPlan')
    const handleClick = error ? handleRetry : entry ? openRecipe : openMealPlan

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        title={label}
        aria-label={isLoading ? t('common.loading') : label}
        className={`flex min-h-11 w-full items-center justify-center rounded-xl p-2.5 text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 disabled:animate-pulse ${className}`}
      >
        <Calendar size={20} />
      </button>
    )
  }

  if (isLoading) {
    return (
      <div
        className={`min-h-24 animate-pulse rounded-xl bg-zinc-200/70 p-3 ${className}`}
        aria-label={t('common.loading')}
      >
        <div className="mb-3 h-3 w-24 rounded bg-zinc-300" />
        <div className="h-10 rounded-lg bg-zinc-300/80" />
      </div>
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
  const thumbnailSrc = proxyUrl(entry.recipe.thumbnail_url)

  return (
    <button
      type="button"
      onClick={openRecipe}
      className={`w-full rounded-xl border border-zinc-200 bg-white p-3 text-left transition-colors hover:bg-zinc-50 ${className}`}
      aria-label={`${t('nextMeal.title')}: ${entry.recipe.title}, ${dateLabel}`}
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
            {entry.recipe.title}
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
