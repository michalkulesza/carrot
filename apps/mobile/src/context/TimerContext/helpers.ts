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

export type TimerSource = 'recipe' | 'cook-mode'

export const isExpoGo = Constants.executionEnvironment === 'storeClient'

export interface TimerEntry {
  id: string
  recipeId: string
  recipeTitle: string
  componentIndex: number
  stepIndex: number
  stepText: string
  source: TimerSource
  totalSeconds: number
  remainingAtStart: number
  startedAt: number | null
  status: 'running' | 'paused' | 'done'
  notificationId?: string
}

type TimerDestination = Pick<TimerEntry, 'recipeId' | 'componentIndex' | 'stepIndex'> & {
  source?: TimerSource
}

export const getTimerDestination = ({ recipeId, componentIndex, stepIndex, source }: TimerDestination) => {
  if (source !== 'cook-mode') return `/recipe/${recipeId}`

  return `/recipe/${recipeId}?cookMode=1&componentIndex=${componentIndex}&stepIndex=${stepIndex}`
}

// A fresh navAt makes an already-open recipe screen jump back to the timer's step even when the other params are unchanged.
export const withNavigationNonce = (path: string) => {
  if (!path.includes('cookMode=1')) return path

  return `${path}&navAt=${Date.now()}`
}

export interface ResumeInfo {
  interrupted: TimerEntry[]
  expired: TimerEntry[]
}

export const getRemainingSeconds = (t: TimerEntry): number => {
  if (t.status !== 'running' || t.startedAt === null) return t.remainingAtStart
  return Math.max(0, t.remainingAtStart - Math.floor((Date.now() - t.startedAt) / 1000))
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export const getTimerNotificationId = (t: Pick<TimerEntry, 'id' | 'notificationId'>) =>
  t.notificationId ?? `timer-${t.id}`

export const buildTimerNotificationContent = (t: TimerEntry) => ({
  title: `⏱️ ${i18n.t('timers.doneLabel')}`,
  subtitle: truncate(t.recipeTitle, 50),
  body: truncate(t.stepText, 80),
  data: {
    type: 'timer_done',
    timerId: t.id,
    recipeId: t.recipeId,
    componentIndex: t.componentIndex,
    stepIndex: t.stepIndex,
    source: t.source,
  },
})

export const scheduleNotif = async (t: TimerEntry): Promise<void> => {
  const seconds = getRemainingSeconds(t)
  if (seconds <= 0) return

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: getTimerNotificationId(t),
      content: buildTimerNotificationContent(t),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
      },
    })
  } catch {}
}

export const cancelNotif = (notificationId: string | undefined) => {
  if (!notificationId) return
  void Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {})
}
