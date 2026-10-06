import { useCallback, useEffect, useRef, useState } from 'react'

const FLASH_MS = 1600

/**
 * Copies a value to the clipboard and remembers which key was copied for a
 * short moment. Repeated taps restart the flash instead of stacking timers.
 */
const useCopyFlash = <Key extends string>() => {
  const [flashed, setFlashed] = useState<Key | null>(null)
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timeout.current), [])

  const copy = useCallback((key: Key, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {})
    setFlashed(key)
    clearTimeout(timeout.current)
    timeout.current = setTimeout(() => setFlashed(null), FLASH_MS)
  }, [])

  return { flashed, copy }
}

export default useCopyFlash
