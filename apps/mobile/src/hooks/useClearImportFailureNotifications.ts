import { useCallback } from 'react'
import * as Notifications from 'expo-notifications'
import { useNotificationHistory } from '../context/NotificationHistoryContext'
import { isExpoGo } from '../context/TimerContext/helpers'

const dismissPresentedFailureNotifications = async (jobId: string) => {
  if (isExpoGo) return
  try {
    const presented = await Notifications.getPresentedNotificationsAsync()
    const matching = presented.filter((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined
      return data?.type === 'recipe_failed' && data?.job_id === jobId
    })
    await Promise.all(matching.map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier)))
  } catch {}
}

export const useClearImportFailureNotifications = () => {
  const { dismissByJobId } = useNotificationHistory()

  return useCallback(
    (jobId: string) => {
      dismissByJobId(jobId)
      void dismissPresentedFailureNotifications(jobId)
    },
    [dismissByJobId],
  )
}
