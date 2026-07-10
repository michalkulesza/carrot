import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import {
  formatCountdown,
  formatDurationLabel,
  parseDurationMatch,
  type DurationMatch,
} from '@carrot/shared/utils/timerUtils'
import i18n from '../../i18n'

export { formatCountdown, formatDurationLabel, parseDurationMatch, type DurationMatch }

export const STORAGE_KEY = 'pk-timers'
export const KEEP_AWAKE_TAG = 'pk-timer'

export const isExpoGo = Constants.executionEnvironment === 'storeClient'

if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

export interface TimerEntry {
  id: string
  recipeId: string
  recipeTitle: string
  componentIndex: number
  stepIndex: number
  stepText: string
  totalSeconds: number
  remainingAtStart: number
  startedAt: number | null
  status: 'running' | 'paused' | 'done'
  notificationId?: string
}

export interface ResumeInfo {
  interrupted: TimerEntry[]
  expired: TimerEntry[]
}

export const getRemainingSeconds = (t: TimerEntry): number => {
  if (t.status !== 'running' || t.startedAt === null) return t.remainingAtStart
  return Math.max(0, t.remainingAtStart - Math.floor((Date.now() - t.startedAt) / 1000))
}

export const scheduleNotif = async (t: TimerEntry): Promise<string | null> => {
  const seconds = getRemainingSeconds(t)
  if (seconds <= 0) return null

  const subtitle = t.recipeTitle.length > 50 ? `${t.recipeTitle.slice(0, 47)}…` : t.recipeTitle
  const body = t.stepText.length > 80 ? `${t.stepText.slice(0, 77)}…` : t.stepText

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏱️ ${i18n.t('bell.timerDone')}`,
        subtitle,
        body,
        data: { timerId: t.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
      },
    })
    return id
  } catch {
    return null
  }
}

export const cancelNotif = (notificationId: string | undefined) => {
  if (!notificationId) return
  void Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {})
}
