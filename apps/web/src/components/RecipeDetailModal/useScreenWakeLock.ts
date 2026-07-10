import { useEffect, useRef, useState } from 'react'

export const useScreenWakeLock = () => {
  const [active, setActive] = useState(
    () => localStorage.getItem('wakelock-default') === '1'
  )
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) {
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null

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
        sentinelRef.current = s
      })
      .catch(() => {})

    return () => {
      stale = true
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null
    }
  }, [active])

  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        active &&
        !sentinelRef.current
      ) {
        navigator.wakeLock
          ?.request('screen')
          .then((s) => {
            sentinelRef.current = s
          })
          .catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [active])

  return {
    active,
    toggle: () => setActive((v) => !v),
    release: () => setActive(false),
  }
}
