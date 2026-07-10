import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  formatCountdown,
  formatDurationLabel,
  parseDurationMatch,
  parseDurationSeconds,
  type DurationMatch,
} from '@carrot/shared/utils/timerUtils'
import {
  useNotificationHistory,
  type NotificationItem,
} from './NotificationHistoryContext'

export {
  formatCountdown,
  formatDurationLabel,
  parseDurationMatch,
  parseDurationSeconds,
  type DurationMatch,
}

const STORAGE_KEY = 'pk-timers'

// Module-level SW registration — set once when the SW becomes active
let _swReg: ServiceWorkerRegistration | null = null
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready
    .then((reg) => {
      _swReg = reg
    })
    .catch(() => {})
}

const showNotif = async (
  title: string,
  body: string,
  tag: string,
  opts: NotificationOptions & { renotify?: boolean } = {}
) => {
  if (
    typeof Notification === 'undefined' ||
    Notification.permission !== 'granted'
  )
    return
  const fullOpts = {
    body,
    tag,
    icon: '/icon-192.png',
    ...opts,
  } as NotificationOptions
  if (_swReg) {
    await _swReg.showNotification(title, fullOpts)
  } else {
    new Notification(title, fullOpts)
  }
}

const closeNotif = (tag: string) => {
  _swReg
    ?.getNotifications({ tag })
    .then((list) => list.forEach((n) => n.close()))
    .catch(() => {})
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
  wakeLockTimersEnabled: boolean
  setWakeLockTimersEnabled: (v: boolean) => void
  startTimer: (
    params: Omit<TimerEntry, 'remainingAtStart' | 'startedAt' | 'status'>
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

  return Math.max(
    0,
    t.remainingAtStart - Math.floor((Date.now() - t.startedAt) / 1000)
  )
}

const fireTimerDone = (t: TimerEntry) => {
  const truncatedStepText =
    t.stepText.length > 80 ? `${t.stepText.slice(0, 77)}…` : t.stepText
  const url = `/?recipe=${t.recipeId}&step=${t.componentIndex}-${t.stepIndex}`
  showNotif(`✓ Done — ${t.recipeTitle}`, truncatedStepText, `timer-${t.id}`, {
    renotify: true,
    data: { url },
  })
}

const fireTimerStart = (t: TimerEntry) => {
  showNotif(
    `⏱ ${t.recipeTitle}`,
    `Step ${t.stepIndex + 1} · ${formatDurationLabel(t.totalSeconds)}`,
    `timer-${t.id}`,
    { silent: true }
  )
}

const buildTimerDoneNotificationPayload = (
  t: TimerEntry
): Omit<NotificationItem, 'id' | 'timestamp'> => ({
  type: 'timer_done',
  title: `✓ Done — ${t.recipeTitle}`,
  body: `Step ${t.stepIndex + 1} · ${formatDurationLabel(t.totalSeconds)}`,
  url: `/?recipe=${t.recipeId}&step=${t.componentIndex}-${t.stepIndex}`,
})

const saveToStorage = (timers: Map<string, TimerEntry>) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...timers.values()]))
}

const loadFromStorage = (): {
  initialTimers: Map<string, TimerEntry>
  resumeInfo: ResumeInfo | null
} => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { initialTimers: new Map(), resumeInfo: null }
    const arr: TimerEntry[] = JSON.parse(raw)
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
          // Keep running — re-anchor to now so the countdown continues immediately
          const running: TimerEntry = {
            ...t,
            status: 'running',
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

    const resumeInfo =
      interrupted.length > 0 || expired.length > 0
        ? { interrupted, expired }
        : null

    return { initialTimers, resumeInfo }
  } catch {
    return { initialTimers: new Map(), resumeInfo: null }
  }
}

export const TimerProvider = ({ children }: { children: ReactNode }) => {
  const { push: pushNotification } = useNotificationHistory()
  const [timers, setTimers] = useState<Map<string, TimerEntry>>(
    () => loadFromStorage().initialTimers
  )
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(
    () => loadFromStorage().resumeInfo
  )
  const [expiredQueue, setExpiredQueue] = useState<TimerEntry[]>([])
  const [wakeLockTimersEnabled, setWakeLockTimersEnabledState] = useState(
    () => localStorage.getItem('wakelock-timers') !== '0'
  )
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  // Deduplicates StrictMode's double-invocation of the "done" side-effects per timer id
  const processedDoneRef = useRef<Set<string>>(new Set())

  const notifyTimerDone = useCallback(
    (t: TimerEntry) => {
      fireTimerDone(t)
      pushNotification(buildTimerDoneNotificationPayload(t))
    },
    [pushNotification]
  )

  const firedExpiredRef = useRef(false)
  useEffect(() => {
    if (firedExpiredRef.current) return
    firedExpiredRef.current = true

    if (resumeInfo?.expired.length) {
      resumeInfo.expired.forEach(notifyTimerDone)
      setExpiredQueue(resumeInfo.expired)
    }
  }, [resumeInfo, notifyTimerDone])

  useEffect(() => {
    saveToStorage(timers)
  }, [timers])

  useEffect(() => {
    const id = setInterval(() => {
      setTimers((prev) => {
        let hasRunning = false
        let changed = false
        const next = new Map(prev)
        for (const [tid, t] of next) {
          if (t.status !== 'running') continue
          hasRunning = true
          if (getRemainingSeconds(t) === 0) {
            next.set(tid, {
              ...t,
              status: 'done',
              remainingAtStart: 0,
              startedAt: null,
            })
            changed = true
          }
        }
        if (hasRunning || changed) return new Map(next)

        return prev
      })
    }, 1000)

    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    for (const [id, t] of timers) {
      if (t.status !== 'done' || processedDoneRef.current.has(id)) continue
      processedDoneRef.current.add(id)
      notifyTimerDone(t)
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
  }, [timers, notifyTimerDone])

  const hasRunningTimers = useMemo(
    () => [...timers.values()].some((t) => t.status === 'running'),
    [timers]
  )

  useEffect(() => {
    if (!wakeLockTimersEnabled || !hasRunningTimers) {
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null

      return
    }
    let stale = false
    navigator.wakeLock
      ?.request('screen')
      .then((s) => {
        if (stale) {
          s.release()

          return
        }
        wakeLockRef.current = s
      })
      .catch(() => {})

    return () => {
      stale = true
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [wakeLockTimersEnabled, hasRunningTimers])

  const handleVisibilityChange = useCallback(() => {
    if (
      document.visibilityState === 'visible' &&
      wakeLockTimersEnabled &&
      hasRunningTimers &&
      !wakeLockRef.current
    ) {
      navigator.wakeLock
        ?.request('screen')
        .then((s) => {
          wakeLockRef.current = s
        })
        .catch(() => {})
    }
  }, [wakeLockTimersEnabled, hasRunningTimers])

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [handleVisibilityChange])

  const setWakeLockTimersEnabled = useCallback((v: boolean) => {
    localStorage.setItem('wakelock-timers', v ? '1' : '0')
    setWakeLockTimersEnabledState(v)
  }, [])

  const startTimer = useCallback(
    (params: Omit<TimerEntry, 'remainingAtStart' | 'startedAt' | 'status'>) => {
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'default'
      ) {
        Notification.requestPermission()
      }

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
      fireTimerStart(entry)
    },
    []
  )

  const pauseTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const t = prev.get(id)
      if (!t || t.status !== 'running') return prev
      const next = new Map(prev)
      next.set(id, {
        ...t,
        status: 'paused',
        remainingAtStart: getRemainingSeconds(t),
        startedAt: null,
      })

      return next
    })
  }, [])

  const resumeTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const t = prev.get(id)
      if (!t || t.status !== 'paused') return prev
      const next = new Map(prev)
      next.set(id, { ...t, status: 'running', startedAt: Date.now() })

      return next
    })
  }, [])

  const cancelTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const n = new Map(prev)
      n.delete(id)

      return n
    })
    closeNotif(`timer-${id}`)
  }, [])

  const confirmResume = useCallback(() => {
    setResumeInfo(null)
  }, [])

  const confirmClear = useCallback(() => {
    setTimers(new Map())
    localStorage.removeItem(STORAGE_KEY)
    setResumeInfo(null)
    setExpiredQueue([])
  }, [])

  const dismissExpired = useCallback(() => {
    setExpiredQueue([])
  }, [])

  const contextValue = useMemo<TimerContextValue>(
    () => ({
      timers,
      resumeInfo,
      expiredQueue,
      hasRunningTimers,
      wakeLockTimersEnabled,
      setWakeLockTimersEnabled,
      startTimer,
      pauseTimer,
      resumeTimer,
      cancelTimer,
      confirmResume,
      confirmClear,
      dismissExpired,
    }),
    [
      timers,
      resumeInfo,
      expiredQueue,
      hasRunningTimers,
      wakeLockTimersEnabled,
      setWakeLockTimersEnabled,
      startTimer,
      pauseTimer,
      resumeTimer,
      cancelTimer,
      confirmResume,
      confirmClear,
      dismissExpired,
    ]
  )

  return (
    <TimerContext.Provider value={contextValue}>
      {children}
    </TimerContext.Provider>
  )
}
