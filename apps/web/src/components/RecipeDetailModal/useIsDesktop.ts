import { useEffect, useState } from 'react'

const DESKTOP_QUERY = '(min-width: 1024px)'

export const useIsDesktop = (): boolean => {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches
  )

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    const handleChange = (event: MediaQueryListEvent) =>
      setIsDesktop(event.matches)
    query.addEventListener('change', handleChange)

    return () => query.removeEventListener('change', handleChange)
  }, [])

  return isDesktop
}
