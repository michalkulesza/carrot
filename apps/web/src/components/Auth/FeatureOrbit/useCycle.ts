import { useEffect, useState } from 'react'
import { REDUCED_MOTION_QUERY, useMediaQuery } from './useMediaQuery'

/**
 * Returns an index that steps through 0..length-1 every `periodMs`.
 * Under reduced motion it stays on `staticIndex`.
 */
export const useCycle = (
  length: number,
  periodMs: number,
  staticIndex = 0
): number => {
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion) return

    const intervalId = window.setInterval(
      () => setIndex((current) => (current + 1) % length),
      periodMs
    )

    return () => window.clearInterval(intervalId)
  }, [length, periodMs, prefersReducedMotion])

  return prefersReducedMotion ? staticIndex : index
}
