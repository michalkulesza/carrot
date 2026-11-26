import { useCallback, useEffect, useRef } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import type Animated from 'react-native-reanimated'
import type { AnimatedRef } from 'react-native-reanimated'

interface DayLayout {
  top: number
  height: number
}

// Keeps today centred between the header and tab bar until the user scrolls, so late layout changes (entries loading) don't push it off-centre.
export const useScrollToToday = ({
  scrollRef,
  ready,
  todayIso,
  coveredTop,
  coveredBottom,
  onDaysLayout,
  onDayLayout,
  onContentSizeChange,
}: {
  scrollRef: AnimatedRef<Animated.ScrollView>
  ready: boolean
  todayIso: string
  coveredTop: number
  coveredBottom: number
  onDaysLayout: (e: LayoutChangeEvent) => void
  onDayLayout: (iso: string, top: number, height: number) => void
  onContentSizeChange: (width: number, height: number) => void
}) => {
  const daysTopRef = useRef<number | null>(null)
  const dayLayoutsRef = useRef(new Map<string, DayLayout>())
  const viewportHeightRef = useRef(0)
  const contentHeightRef = useRef(0)
  const pinnedRef = useRef(true)

  const flush = useCallback(
    (animated = false) => {
      const today = dayLayoutsRef.current.get(todayIso)
      const viewportHeight = viewportHeightRef.current
      const contentHeight = contentHeightRef.current
      if (!pinnedRef.current || !ready || daysTopRef.current === null || !today || !viewportHeight || !contentHeight) return

      const visibleCentre = coveredTop + (viewportHeight - coveredTop - coveredBottom) / 2
      const centred = daysTopRef.current + today.top + today.height / 2 - visibleCentre
      const maxY = Math.max(0, contentHeight - viewportHeight)
      const y = Math.min(Math.max(0, centred), maxY)

      scrollRef.current?.scrollTo({ y, animated })
    },
    [ready, todayIso, coveredTop, coveredBottom, scrollRef],
  )

  const handleDaysLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onDaysLayout(e)
      daysTopRef.current = e.nativeEvent.layout.y
      flush()
    },
    [onDaysLayout, flush],
  )

  const handleDayLayout = useCallback(
    (iso: string, top: number, height: number) => {
      onDayLayout(iso, top, height)
      dayLayoutsRef.current.set(iso, { top, height })
      if (iso === todayIso) flush()
    },
    [onDayLayout, todayIso, flush],
  )

  const handleScrollLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewportHeightRef.current = e.nativeEvent.layout.height
      flush()
    },
    [flush],
  )

  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      onContentSizeChange(width, height)
      contentHeightRef.current = height
      flush()
    },
    [onContentSizeChange, flush],
  )

  const scrollToToday = useCallback(
    (animated = false) => {
      pinnedRef.current = true
      flush(animated)
    },
    [flush],
  )

  const releasePin = useCallback(() => {
    pinnedRef.current = false
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(() => flush())

    return () => cancelAnimationFrame(frame)
  }, [flush])

  return { handleDaysLayout, handleDayLayout, handleScrollLayout, handleContentSizeChange, scrollToToday, releasePin }
}
