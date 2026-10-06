import { useSyncExternalStore } from 'react'

export const DESKTOP_QUERY = '(min-width: 1024px)'
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export const useMediaQuery = (query: string): boolean => {
  const subscribe = (onChange: () => void) => {
    const mediaQuery = window.matchMedia(query)
    mediaQuery.addEventListener('change', onChange)

    return () => mediaQuery.removeEventListener('change', onChange)
  }

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}
