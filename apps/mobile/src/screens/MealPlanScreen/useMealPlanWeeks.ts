import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMealPlanDays } from '@carrot/shared/hooks/useMealPlanDays'
import { parseISODateLocal } from '@carrot/shared/utils/dateUtils'
import { DAYS_IN_WEEK, buildWeekDays, formatWeekRange, getWeekStartIso, shiftWeek, type WeekDay } from './helpers'

const DEFAULT_WEEKS_AROUND = 1

export interface MealPlanWeek {
  startIso: string
  label: string
  isCurrent: boolean
  days: WeekDay[]
}

const WEEK_LABEL_KEYS: Record<number, string> = {
  [-1]: 'mealPlan.prevWeek',
  0: 'mealPlan.thisWeek',
  1: 'mealPlan.nextWeek',
}

export const useMealPlanWeeks = ({
  todayIso,
  weekStartDay,
  locale,
}: {
  todayIso: string
  weekStartDay: number
  locale: string
}) => {
  const { t } = useTranslation()
  const [weeksBefore, setWeeksBefore] = useState(DEFAULT_WEEKS_AROUND)
  const [weeksAfter, setWeeksAfter] = useState(DEFAULT_WEEKS_AROUND)

  const currentWeekStartIso = useMemo(
    () => getWeekStartIso(parseISODateLocal(todayIso), weekStartDay),
    [todayIso, weekStartDay],
  )
  const rangeStartIso = useMemo(() => shiftWeek(currentWeekStartIso, -weeksBefore), [currentWeekStartIso, weeksBefore])
  const weekCount = weeksBefore + 1 + weeksAfter

  const { entriesByDate, isLoading } = useMealPlanDays(rangeStartIso, weekCount * DAYS_IN_WEEK)

  const weeks = useMemo<MealPlanWeek[]>(
    () =>
      Array.from({ length: weekCount }, (_, index) => {
        const offset = index - weeksBefore
        const startIso = shiftWeek(currentWeekStartIso, offset)
        const labelKey = WEEK_LABEL_KEYS[offset]

        return {
          startIso,
          label: labelKey ? t(labelKey) : formatWeekRange(startIso, locale),
          isCurrent: offset === 0,
          days: buildWeekDays(startIso, entriesByDate, todayIso, locale),
        }
      }),
    [weekCount, weeksBefore, currentWeekStartIso, entriesByDate, todayIso, locale, t],
  )

  const loadPreviousWeek = useCallback(() => setWeeksBefore((count) => count + 1), [])
  const loadNextWeek = useCallback(() => setWeeksAfter((count) => count + 1), [])
  const resetWeeks = useCallback(() => {
    setWeeksBefore(DEFAULT_WEEKS_AROUND)
    setWeeksAfter(DEFAULT_WEEKS_AROUND)
  }, [])

  return { weeks, currentWeekStartIso, entriesByDate, isLoading, loadPreviousWeek, loadNextWeek, resetWeeks }
}
