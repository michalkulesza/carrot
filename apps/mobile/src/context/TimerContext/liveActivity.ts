import { Platform } from 'react-native'
import {
  endAll,
  isSupported,
  readPendingChanges,
  sync,
  type PendingTimerChange,
  type TimerActivityItem,
} from '../../../modules/timer-live-activity'
import i18n from '../../i18n'
import {
  buildTimerNotificationContent,
  formatDurationLabel,
  getRemainingSeconds,
  getTimerDestination,
  getTimerNotificationId,
  isExpoGo,
  type TimerEntry,
} from './helpers'

export type { PendingTimerChange }

// ActivityKit caps content state at 4KB; each item is roughly 600 bytes.
const MAX_ACTIVITY_TIMERS = 6

const isAvailable = () => Platform.OS === 'ios' && !isExpoGo && isSupported()

const buildStepLabel = (timer: TimerEntry): string =>
  i18n.t('timers.doneBody', {
    step: timer.stepIndex + 1,
    duration: formatDurationLabel(timer.totalSeconds),
  })

const buildActivityItem = (timer: TimerEntry): TimerActivityItem => {
  const notification = buildTimerNotificationContent(timer)
  const isRunning = timer.status === 'running' && timer.startedAt !== null
  const endDateMs = isRunning ? timer.startedAt! + timer.remainingAtStart * 1000 : null

  return {
    id: timer.id,
    recipeTitle: timer.recipeTitle,
    stepLabel: buildStepLabel(timer),
    deepLink: `carrot:/${getTimerDestination(timer)}`,
    status: isRunning ? 'running' : 'paused',
    remainingSeconds: getRemainingSeconds(timer),
    endDateMs,
    notificationId: getTimerNotificationId(timer),
    notificationTitle: notification.title,
    notificationBody: notification.body,
    notificationPayload: JSON.stringify(notification.data),
  }
}

const compareByEnd = (a: TimerActivityItem, b: TimerActivityItem) => {
  if (a.status !== b.status) return a.status === 'running' ? -1 : 1
  return (a.endDateMs ?? 0) - (b.endDateMs ?? 0)
}

export const buildActivityItems = (timers: TimerEntry[]): TimerActivityItem[] =>
  timers
    .filter((timer) => timer.status !== 'done')
    .map(buildActivityItem)
    .sort(compareByEnd)
    .slice(0, MAX_ACTIVITY_TIMERS)

let syncQueue: Promise<unknown> = Promise.resolve()
let lastSyncKey: string | null = null

export const syncActivity = (
  timers: TimerEntry[],
  moreFormat: string,
  doneLabel: string,
): Promise<void> => {
  if (!isAvailable()) return Promise.resolve()

  const items = buildActivityItems(timers)
  const key = JSON.stringify([items, moreFormat, doneLabel])
  if (key === lastSyncKey) return Promise.resolve()
  lastSyncKey = key

  const run = async () => {
    try {
      await sync(items, moreFormat, doneLabel)
    } catch {
      lastSyncKey = null
    }
  }
  syncQueue = syncQueue.then(run)

  return syncQueue as Promise<void>
}

export const endAllActivities = async (): Promise<void> => {
  if (!isAvailable()) return

  lastSyncKey = JSON.stringify([])
  try {
    await endAll()
  } catch {}
}

export const readPendingActivityChanges = (): PendingTimerChange[] => {
  if (!isAvailable()) return []

  try {
    return readPendingChanges()
  } catch {
    return []
  }
}

const applyPendingChange = (timer: TimerEntry, change: PendingTimerChange, now: number): TimerEntry => {
  if (change.status === 'paused') {
    return { ...timer, status: 'paused', remainingAtStart: change.remainingSeconds, startedAt: null }
  }

  const remaining = change.endDateMs === null ? change.remainingSeconds : Math.ceil((change.endDateMs - now) / 1000)

  return { ...timer, status: 'running', remainingAtStart: Math.max(0, remaining), startedAt: now }
}

export const applyPendingChanges = (
  timers: Map<string, TimerEntry>,
  changes: PendingTimerChange[],
): Map<string, TimerEntry> => {
  if (changes.length === 0) return timers

  const now = Date.now()
  const next = new Map(timers)
  const ordered = [...changes].sort((a, b) => a.changedAtMs - b.changedAtMs)

  for (const change of ordered) {
    const timer = next.get(change.id)
    if (!timer || timer.status === 'done') continue

    if (change.status === 'cancelled') next.delete(change.id)
    else next.set(change.id, applyPendingChange(timer, change, now))
  }

  return next
}
