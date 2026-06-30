import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import * as KeepAwake from 'expo-keep-awake'
import * as Notifications from 'expo-notifications'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  formatCountdown,
  formatDurationLabel,
  parseDurationMatch,
  type DurationMatch,
} from '@platekeeper/shared/utils/timerUtils'
import { useNotificationHistory } from './NotificationHistoryContext'

export { formatCountdown, formatDurationLabel, parseDurationMatch, type DurationMatch }

const STORAGE_KEY = 'pk-timers'
const KEEP_AWAKE_TAG = 'pk-timer'

const isExpoGo = Constants.executionEnvironment === 'storeClient'

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

interface TimerContextValue {
  timers: Map<string, TimerEntry>
  resumeInfo: ResumeInfo | null
  expiredQueue: TimerEntry[]
  hasRunningTimers: boolean
  keepScreenOn: boolean
  setKeepScreenOn: (v: boolean) => void
  startTimer: (
    params: Omit<TimerEntry, 'remainingAtStart' | 'startedAt' | 'status' | 'notificationId'>,
  ) => void
  pauseTimer: (id: string) => void
  resumeTimer: (id: string) => void
  cancelTimer: (id: string) => void
  confirmResume: () => void
  confirmClear: () => void
  dismissExpired: () => void
}

const TimerContext = createContext<TimerContextValue | null>(null)

export const useTimers = () => {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimers must be used within TimerProvider')
  return ctx
}

export const getRemainingSeconds = (t: TimerEntry): number => {
  if (t.status !== 'running' || t.startedAt === null) return t.remainingAtStart
  return Math.max(0, t.remainingAtStart - Math.floor((Date.now() - t.startedAt) / 1000))
}

const scheduleNotif = async (t: TimerEntry): Promise<string | null> => {
  const seconds = getRemainingSeconds(t)
  if (seconds <= 0) return null
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏱️ Timer done',
        subtitle: t.recipeTitle.length > 50 ? t.recipeTitle.slice(0, 47) + '…' : t.recipeTitle,
        body: t.stepText.length > 80 ? t.stepText.slice(0, 77) + '…' : t.stepText,
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

const cancelNotif = (notificationId: string | undefined) => {
  if (!notificationId) return
  void Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {})
}

export const TimerProvider = ({ children }: { children: ReactNode }) => {
  const { push: pushNotification } = useNotificationHistory()
  const [timers, setTimers] = useState<Map<string, TimerEntry>>(new Map())
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(null)
  const [expiredQueue, setExpiredQueue] = useState<TimerEntry[]>([])
  const [keepScreenOn, setKeepScreenOnState] = useState(true)
  const processedDoneRef = useRef<Set<string>>(new Set())
  const loadedRef = useRef(false)

  // Request permissions on mount (not available in Expo Go SDK 53+)
  useEffect(() => {
    if (!isExpoGo) void Notifications.requestPermissionsAsync()
  }, [])

  // Load persisted timers on mount
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const arr: TimerEntry[] = JSON.parse(raw) as TimerEntry[]
        const now = Date.now()
        const initialTimers = new Map<string, TimerEntry>()
        const interrupted: TimerEntry[] = []
        const expired: TimerEntry[] = []

        for (const t of arr) {
          if (t.status === 'done') continue
          if (t.status === 'running' && t.startedAt) {
            const elapsed = Math.floor((now - t.startedAt) / 1000)
            const remaining = t.remainingAtStart - elapsed
            if (remaining <= 0) {
              expired.push({
                ...t,
                status: 'done',
                remainingAtStart: 0,
                startedAt: null,
              })
            } else {
              const running: TimerEntry = {
                ...t,
                remainingAtStart: remaining,
                startedAt: Date.now(),
                notificationId: undefined,
              }
              initialTimers.set(t.id, running)
              interrupted.push(running)
            }
          } else if (t.status === 'paused') {
            initialTimers.set(t.id, t)
            interrupted.push(t)
          }
        }

        if (expired.length > 0) {
          expired.forEach((t) => {
            pushNotification({
              type: 'timer_done',
              title: `✓ Done — ${t.recipeTitle}`,
              body: `Step ${t.stepIndex + 1} · ${formatDurationLabel(t.totalSeconds)}`,
            })
          })
          setExpiredQueue(expired)
        }

        setTimers(initialTimers)
        const ri =
          interrupted.length > 0 || expired.length > 0
            ? { interrupted, expired }
            : null
        setResumeInfo(ri)
      } catch {
        // ignore corrupt storage
      }
    })()
  }, [])

  // Persist on every change
  useEffect(() => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...timers.values()]))
  }, [timers])

  // Tick: detect expiry
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers((prev) => {
        let changed = false
        let hasRunning = false
        const next = new Map(prev)
        for (const [tid, t] of next) {
          if (t.status !== 'running') continue
          hasRunning = true
          if (getRemainingSeconds(t) === 0) {
            next.set(tid, { ...t, status: 'done', remainingAtStart: 0, startedAt: null })
            changed = true
          }
        }
        return hasRunning || changed ? new Map(next) : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Side-effects for expired timers
  useEffect(() => {
    for (const [id, t] of timers) {
      if (t.status !== 'done' || processedDoneRef.current.has(id)) continue
      processedDoneRef.current.add(id)
      setExpiredQueue((prev) => [...prev, t])
      pushNotification({
        type: 'timer_done',
        title: `✓ Done — ${t.recipeTitle}`,
        body: `Step ${t.stepIndex + 1} · ${formatDurationLabel(t.totalSeconds)}`,
      })
      setTimeout(() => {
        setTimers((m) => {
          const n = new Map(m)
          n.delete(id)
          return n
        })
        processedDoneRef.current.delete(id)
      }, 5000)
    }
  }, [timers])

  const hasRunningTimers = [...timers.values()].some((t) => t.status === 'running')

  // Keep screen on while timers are running
  useEffect(() => {
    if (keepScreenOn && hasRunningTimers) {
      void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG)
    } else {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG)
    }
  }, [keepScreenOn, hasRunningTimers])

  const setKeepScreenOn = useCallback((v: boolean) => {
    setKeepScreenOnState(v)
  }, [])

  const startTimer = useCallback(
    (
      params: Omit<
        TimerEntry,
        'remainingAtStart' | 'startedAt' | 'status' | 'notificationId'
      >,
    ) => {
      const entry: TimerEntry = {
        ...params,
        remainingAtStart: params.totalSeconds,
        startedAt: Date.now(),
        status: 'running',
      }
      setTimers((prev) => {
        const n = new Map(prev)
        n.set(entry.id, entry)
        return n
      })
      void scheduleNotif(entry).then((notificationId) => {
        if (!notificationId) return
        setTimers((m) => {
          const e = m.get(entry.id)
          if (!e) return m
          const n = new Map(m)
          n.set(entry.id, { ...e, notificationId })
          return n
        })
      })
    },
    [],
  )

  const pauseTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const t = prev.get(id)
      if (!t || t.status !== 'running') return prev
      cancelNotif(t.notificationId)
      const next = new Map(prev)
      next.set(id, {
        ...t,
        status: 'paused',
        remainingAtStart: getRemainingSeconds(t),
        startedAt: null,
        notificationId: undefined,
      })
      return next
    })
  }, [])

  const resumeTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const t = prev.get(id)
      if (!t || t.status !== 'paused') return prev
      const resumed: TimerEntry = { ...t, status: 'running', startedAt: Date.now() }
      void scheduleNotif(resumed).then((notificationId) => {
        if (!notificationId) return
        setTimers((m) => {
          const e = m.get(id)
          if (!e || e.status !== 'running') return m
          const n = new Map(m)
          n.set(id, { ...e, notificationId })
          return n
        })
      })
      const next = new Map(prev)
      next.set(id, resumed)
      return next
    })
  }, [])

  const cancelTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const t = prev.get(id)
      cancelNotif(t?.notificationId)
      const n = new Map(prev)
      n.delete(id)
      return n
    })
  }, [])

  const confirmResume = useCallback(() => {
    setResumeInfo(null)
  }, [])

  const confirmClear = useCallback(() => {
    setTimers((prev) => {
      for (const t of prev.values()) cancelNotif(t.notificationId)
      return new Map()
    })
    void AsyncStorage.removeItem(STORAGE_KEY)
    setResumeInfo(null)
    setExpiredQueue([])
  }, [])

  const dismissExpired = useCallback(() => {
    setExpiredQueue([])
  }, [])

  return (
    <TimerContext.Provider
      value={{
        timers,
        resumeInfo,
        expiredQueue,
        hasRunningTimers,
        keepScreenOn,
        setKeepScreenOn,
        startTimer,
        pauseTimer,
        resumeTimer,
        cancelTimer,
        confirmResume,
        confirmClear,
        dismissExpired,
      }}
    >
      {children}
    </TimerContext.Provider>
  )
}
