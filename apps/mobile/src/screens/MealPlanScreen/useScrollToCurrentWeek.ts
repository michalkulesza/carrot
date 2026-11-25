import { useCallback, useEffect, useRef } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import type Animated from 'react-native-reanimated'
import type { AnimatedRef } from 'react-native-reanimated'

// Keeps the current week pinned to the top until the user scrolls, so late layout changes (entries loading) don't leave it off.
export const useScrollToCurrentWeek = ({
  scrollRef,
  ready,
  minOffset,
  topOffset,
  onDaysLayout,
}: {
  scrollRef: AnimatedRef<Animated.ScrollView>
  ready: boolean
  minOffset: number
  topOffset: number
  onDaysLayout: (e: LayoutChangeEvent) => void
}) => {
  const daysTopRef = useRef<number | null>(null)
  const weekTopRef = useRef<number | null>(null)
  const pinnedRef = useRef(true)

  const flush = useCallback(() => {
    if (!pinnedRef.current || !ready || daysTopRef.current === null || weekTopRef.current === null) return

    const y = Math.max(minOffset, daysTopRef.current + weekTopRef.current - topOffset)

    scrollRef.current?.scrollTo({ y, animated: false })
  }, [ready, minOffset, topOffset, scrollRef])

  const handleDaysLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onDaysLayout(e)
      daysTopRef.current = e.nativeEvent.layout.y
      flush()
    },
    [onDaysLayout, flush],
  )

  const handleCurrentWeekLayout = useCallback(
    (e: LayoutChangeEvent) => {
      weekTopRef.current = e.nativeEvent.layout.y
      flush()
    },
    [flush],
  )

  const scrollToCurrentWeek = useCallback(() => {
    pinnedRef.current = true
    flush()
  }, [flush])

  const releasePin = useCallback(() => {
    pinnedRef.current = false
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(flush)

    return () => cancelAnimationFrame(frame)
  }, [flush])

  return { handleDaysLayout, handleCurrentWeekLayout, scrollToCurrentWeek, releasePin }
}
