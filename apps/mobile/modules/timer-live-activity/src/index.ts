import { requireOptionalNativeModule } from 'expo'

export interface TimerActivityItem {
  id: string
  recipeTitle: string
  stepLabel: string
  deepLink: string
  status: 'running' | 'paused'
  remainingSeconds: number
  endDateMs: number | null
  notificationId: string
  notificationTitle: string
  notificationBody: string
  notificationPayload: string
}

export interface PendingTimerChange {
  id: string
  status: 'running' | 'paused' | 'cancelled'
  remainingSeconds: number
  endDateMs: number | null
  changedAtMs: number
}

interface TimerLiveActivityNativeModule {
  isSupported(): boolean
  sync(timers: TimerActivityItem[], moreFormat: string, doneLabel: string): Promise<boolean>
  endAll(): Promise<void>
  readPendingChanges(): PendingTimerChange[]
}

const native = requireOptionalNativeModule<TimerLiveActivityNativeModule>('TimerLiveActivity')

export const isSupported = () => native?.isSupported() ?? false
export const sync = async (timers: TimerActivityItem[], moreFormat: string, doneLabel: string) =>
  (await native?.sync(timers, moreFormat, doneLabel)) ?? false
export const endAll = async () => native?.endAll()
export const readPendingChanges = () => native?.readPendingChanges() ?? []
