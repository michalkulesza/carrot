import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { AppState } from 'react-native'
import {
  cancelNotif,
  formatCountdown,
  formatDurationLabel,
  getTimerDestination,
  getTimerNotificationId,
  getRemainingSeconds,
  parseDurationMatch,
  scheduleNotif,
  STORAGE_KEY,
  type DurationMatch,
  type ResumeInfo,
  type TimerEntry,
} from './helpers'
import {
  applyPendingChanges,
  endAllActivities,
  readPendingActivityChanges,
  syncActivity,
} from './liveActivity'

export { formatCountdown, formatDurationLabel, parseDurationMatch, type DurationMatch }
export { getRemainingSeconds, getTimerDestination, type ResumeInfo, type TimerEntry }

interface TimerContextValue {
  timers: Map<string, TimerEntry>
  resumeInfo: ResumeInfo | null
  expiredQueue: TimerEntry[]
  hasRunningTimers: boolean
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

export const TimerProvider = ({ children }: { children: ReactNode }) => {
  const { t: translate } = useTranslation()
  const [timers, setTimers] = useState<Map<string, TimerEntry>>(new Map())
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(null)
  const [expiredQueue, setExpiredQueue] = useState<TimerEntry[]>([])
  const processedDoneRef = useRef<Set<string>>(new Set())
  const loadedRef = useRef(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const stored = new Map((JSON.parse(raw) as TimerEntry[]).map((entry) => [entry.id, entry]))
        const arr = [...applyPendingChanges(stored, readPendingActivityChanges()).values()]
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
              }
              initialTimers.set(t.id, running)
              interrupted.push(running)
            }
          } else if (t.status === 'paused') {
            initialTimers.set(t.id, t)
            interrupted.push(t)
          }
        }

        if (expired.length > 0) setExpiredQueue(expired)

        setTimers(initialTimers)
        const ri =
          interrupted.length > 0 || expired.length > 0
            ? { interrupted, expired }
            : null
        setResumeInfo(ri)
      } catch {
        // ignore corrupt storage
      } finally {
        setHydrated(true)
      }
    })()
  }, [])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return

      const changes = readPendingActivityChanges()
      if (changes.length > 0) setTimers((prev) => applyPendingChanges(prev, changes))
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...timers.values()]))
  }, [timers])

  useEffect(() => {
    const interval = setInterval(() => {
      setTimers((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const [tid, t] of next) {
          if (t.status !== 'running') continue
          if (getRemainingSeconds(t) === 0) {
            next.set(tid, { ...t, status: 'done', remainingAtStart: 0, startedAt: null })
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    for (const [id, t] of timers) {
      if (t.status !== 'done' || processedDoneRef.current.has(id)) continue
      processedDoneRef.current.add(id)
      setExpiredQueue((prev) => [...prev, t])
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

  useEffect(() => {
    if (!hydrated) return
    void syncActivity([...timers.values()], translate('timers.moreCount'), translate('timers.doneShort'))
  }, [timers, hydrated, translate])

  const hasRunningTimers = [...timers.values()].some((t) => t.status === 'running')

  const startTimer = useCallback(
    (
      params: Omit<
        TimerEntry,
        'remainingAtStart' | 'startedAt' | 'status' | 'notificationId'
      >,
    ) => {
      const entry: TimerEntry = {
        ...params,
        notificationId: getTimerNotificationId(params),
        remainingAtStart: params.totalSeconds,
        startedAt: Date.now(),
        status: 'running',
      }
      setTimers((prev) => {
        const n = new Map(prev)
        n.set(entry.id, entry)
        return n
      })
      void scheduleNotif(entry)
    },
    [],
  )

  const pauseTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const t = prev.get(id)
      if (!t || t.status !== 'running') return prev
      cancelNotif(t.notificationId)
      const paused: TimerEntry = {
        ...t,
        status: 'paused',
        remainingAtStart: getRemainingSeconds(t),
        startedAt: null,
      }

      const next = new Map(prev)
      next.set(id, paused)
      return next
    })
  }, [])

  const resumeTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const t = prev.get(id)
      if (!t || t.status !== 'paused') return prev
      const resumed: TimerEntry = { ...t, status: 'running', startedAt: Date.now() }
      void scheduleNotif(resumed)
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
    void endAllActivities()
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
