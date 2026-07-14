import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '../api/context'
import { toISODate } from '../utils/dateUtils'

const millisecondsUntilLocalMidnight = (): number => {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 100)
  return midnight.getTime() - now.getTime()
}

export const useNextMealPlanEntry = () => {
  const api = useApiClient()
  const [todayIso, setTodayIso] = useState(() => toISODate(new Date()))

  useEffect(() => {
    const timeout = setTimeout(() => {
      setTodayIso(toISODate(new Date()))
    }, millisecondsUntilLocalMidnight())

    return () => clearTimeout(timeout)
  }, [todayIso])

  const query = useQuery({
    queryKey: ['mealPlan', 'next', todayIso],
    queryFn: () => api.getNextMealPlanEntry(todayIso),
  })

  return {
    entry: query.data ?? null,
    todayIso,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
  }
}
