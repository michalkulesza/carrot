import { useCallback, useEffect, useRef } from 'react'
import type { CalendarDate } from '@internationalized/date'

const BOTTOM_NAV_HEIGHT = 72
const INITIAL_SCROLL_DELAY_MS = 500

export const useScrollToToday = (
  viewYear: number,
  viewMonth: number,
  todayDate: CalendarDate
) => {
  const dayRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const stickyRef = useRef<HTMLDivElement>(null)

  const setDayRef = useCallback(
    (day: number) => (el: HTMLDivElement | null) => {
      if (el) dayRefs.current.set(day, el)
      else dayRefs.current.delete(day)
    },
    []
  )

  const scrollToDay = useCallback((day: number) => {
    const el = dayRefs.current.get(day)
    if (!el) return

    const stickyBottom = stickyRef.current?.getBoundingClientRect().bottom ?? 0
    const visibleHeight = window.innerHeight - stickyBottom - BOTTOM_NAV_HEIGHT
    const elRect = el.getBoundingClientRect()
    const targetScroll =
      window.scrollY +
      elRect.top -
      stickyBottom -
      (visibleHeight - elRect.height) / 2

    window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (todayDate.year === viewYear && todayDate.month === viewMonth) {
        scrollToDay(todayDate.day)
      }
    }, INITIAL_SCROLL_DELAY_MS)

    return () => clearTimeout(timer)
    // Only scroll once on mount — subsequent month navigation shouldn't re-trigger the jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { stickyRef, setDayRef }
}
