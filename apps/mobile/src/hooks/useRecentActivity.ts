import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  clearCookSession as clearStoredCookSession,
  readRecentActivity,
  writeCookSession,
  writeLastViewed,
  type CookSession,
  type RecentActivity,
} from '../storage/recentActivity'

const RECENT_ACTIVITY_KEY = ['recentActivity']
const EMPTY_ACTIVITY: RecentActivity = {}

export const useRecentActivity = () => {
  const { data, isLoading } = useQuery({
    queryKey: RECENT_ACTIVITY_KEY,
    queryFn: readRecentActivity,
    staleTime: Infinity,
  })

  return { activity: data ?? EMPTY_ACTIVITY, isLoading }
}

export const useRecentActivityWriters = () => {
  const queryClient = useQueryClient()

  const getCurrent = useCallback(
    () => queryClient.getQueryData<RecentActivity>(RECENT_ACTIVITY_KEY),
    [queryClient],
  )

  const publish = useCallback(
    (activity: RecentActivity) => queryClient.setQueryData<RecentActivity>(RECENT_ACTIVITY_KEY, activity),
    [queryClient],
  )

  const setCookSession = useCallback(
    async (session: CookSession) => {
      const cook = getCurrent()?.cook
      const unchanged =
        cook?.recipeId === session.recipeId &&
        cook.stepIndex === session.stepIndex &&
        cook.totalSteps === session.totalSteps
      if (unchanged) return

      publish(await writeCookSession(session))
    },
    [getCurrent, publish],
  )

  const clearCookSession = useCallback(
    async (recipeId: string) => {
      const current = getCurrent()
      if (current && current.cook?.recipeId !== recipeId) return

      publish(await clearStoredCookSession(recipeId))
    },
    [getCurrent, publish],
  )

  const setLastViewed = useCallback(
    async (recipeId: string) => {
      if (getCurrent()?.lastViewed?.recipeId === recipeId) return

      publish(await writeLastViewed(recipeId))
    },
    [getCurrent, publish],
  )

  return { setCookSession, clearCookSession, setLastViewed }
}
