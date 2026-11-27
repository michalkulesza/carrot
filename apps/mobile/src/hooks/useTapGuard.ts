import { useCallback, useRef } from 'react'

const DEFAULT_GRACE_MS = 600

export const useTapGuard = (graceMs = DEFAULT_GRACE_MS) => {
  const lastAccepted = useRef(0)

  return useCallback(() => {
    const now = Date.now()
    if (now - lastAccepted.current < graceMs) return false
    lastAccepted.current = now

    return true
  }, [graceMs])
}
