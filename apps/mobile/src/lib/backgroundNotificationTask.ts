import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import { isExpoGo } from '../context/TimerContext/helpers'
import { dismissPresentedByCollapseId, getRetractCollapseId } from './presentedNotifications'

const BACKGROUND_NOTIFICATION_TASK = 'carrot-background-notification'

type BackgroundNotificationPayload = Record<string, unknown> & {
  data?: Record<string, unknown>
  notification?: { request?: { content?: { data?: Record<string, unknown> } } }
}

const extractPayloadData = (payload: BackgroundNotificationPayload) =>
  payload.notification?.request?.content?.data ?? payload.data ?? payload

if (!isExpoGo) {
  TaskManager.defineTask<BackgroundNotificationPayload>(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error || !data) return

    const collapseId = getRetractCollapseId(extractPayloadData(data))
    if (collapseId) await dismissPresentedByCollapseId(collapseId)
  })

  void Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {})
}
