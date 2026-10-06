import { useCallback } from 'react'
import { Calendar } from 'react-feather'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useNextMealPlanEntry } from '@carrot/shared/hooks/useNextMealPlanEntry'
import { formatNextMealDate } from '@carrot/shared/utils/dateUtils'
import NetworkImage from './NetworkImage'
import NextMealCardSkeleton from './NextMealCardSkeleton'
import NextMealCardLabel from './NextMealCardLabel'
import { proxyUrl } from '../utils/imageUtils'
import { formatCookingTime } from '../utils/formatCookingTime'
import { useRouteNavigation } from '../routing/RouteNavigationContext'

const CARD_SHELL =
  'flex flex-col gap-2.5 rounded-2xl border border-line bg-white p-3 font-nunito'
const CARD_HOVER = 'transition-colors hover:border-line-strong hover:shadow-sm'

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
      <div className={`${CARD_SHELL} ${className}`}>
        <NextMealCardLabel>{t('nextMeal.title')}</NextMealCardLabel>
        <p className="text-sm font-semibold text-red-700">
          {t('nextMeal.error')}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="min-h-11 self-start text-sm font-bold text-carrot-strong underline underline-offset-2"
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
        className={`${CARD_SHELL} ${CARD_HOVER} w-full cursor-pointer text-left ${className}`}
      >
        <NextMealCardLabel>{t('nextMeal.title')}</NextMealCardLabel>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-extrabold leading-tight text-ink">
            {t('nextMeal.empty')}
          </span>
          <span className="text-xs font-semibold text-carrot-strong">
            {t('nextMeal.openPlan')}
          </span>
        </span>
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
  const cookingTime =
    entry.recipe && entry.recipe.total_time_minutes !== null
      ? formatCookingTime(entry.recipe.total_time_minutes, t)
      : ''
  const metaLabel = cookingTime ? `${dateLabel} · ${cookingTime}` : dateLabel

  return (
    <button
      type="button"
      onClick={openRecipe}
      className={`${CARD_SHELL} ${CARD_HOVER} w-full cursor-pointer text-left ${className}`}
      aria-label={`${t('nextMeal.title')}: ${entryTitle}, ${dateLabel}`}
    >
      <NextMealCardLabel>{t('nextMeal.title')}</NextMealCardLabel>
      {thumbnailSrc ? (
        <NetworkImage
          src={thumbnailSrc}
          alt=""
          className="h-[132px] w-full shrink-0 rounded-xl"
        />
      ) : (
        <span className="flex h-[132px] w-full shrink-0 items-center justify-center rounded-xl bg-carrot-tint text-carrot">
          <Calendar size={32} aria-hidden="true" />
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="line-clamp-2 text-[15px] font-extrabold leading-tight text-ink">
          {entryTitle}
        </span>
        <span className="text-xs font-semibold text-ink-muted">
          {metaLabel}
        </span>
      </span>
    </button>
  )
}

export default NextMealCard
