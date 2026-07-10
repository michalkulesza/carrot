import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, FlatList, LayoutChangeEvent } from 'react-native'
import type { EdgeInsets } from 'react-native-safe-area-context'
import { DAY_ROW_HEIGHT } from './helpers'

// scrollToIndex's viewPosition centers against the FlatList's raw frame height,
// which — because headerTransparent lets content render behind the header, and
// the tab bar floats over content too — equals the full window height, not the
// space actually visible between them. Compute the target offset manually
// against the visible strip [header bottom, tab bar top] instead, and apply it
// with scrollToOffset. Header/tab bar content heights beyond the safe area are
// standard iOS constants (no large title on this screen, standard tab bar)
// since neither is measurable from this screen's own view tree.
const HEADER_CONTENT_HEIGHT = 44
const TAB_BAR_CONTENT_HEIGHT = 49

export const useCenterOnToday = ({
  offsets,
  todayIndex,
  windowHeight,
  insets,
}: {
  offsets: number[]
  todayIndex: number
  windowHeight: number
  insets: EdgeInsets
}) => {
  const listRef = useRef<FlatList>(null)
  const hasUserScrolled = useRef(false)
  const [isCentered, setIsCentered] = useState(false)
  const listOpacity = useRef(new Animated.Value(0)).current

  const targetScrollOffset = useMemo(() => {
    const todayOffset = offsets[todayIndex] ?? 0
    const visibleTop = insets.top + HEADER_CONTENT_HEIGHT
    const visibleBottom = windowHeight - insets.bottom - TAB_BAR_CONTENT_HEIGHT
    const visibleCenter = (visibleTop + visibleBottom) / 2
    return Math.max(0, todayOffset - visibleCenter + DAY_ROW_HEIGHT / 2)
  }, [offsets, todayIndex, windowHeight, insets.top, insets.bottom])

  const recenterOnToday = useCallback((animated: boolean) => {
    if (hasUserScrolled.current) return
    listRef.current?.scrollToOffset({ offset: targetScrollOffset, animated })
    setIsCentered(true)
  }, [targetScrollOffset])

  // Fire as soon as the ref exists, and again on every later layout change in
  // case the first call landed before the FlatList was fully attached — a
  // cheap no-op otherwise since recenterOnToday is idempotent.
  useEffect(() => {
    recenterOnToday(false)
  }, [recenterOnToday])

  const handleListLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      recenterOnToday(false)
    },
    [recenterOnToday],
  )

  const handleScrollBeginDrag = useCallback(() => {
    hasUserScrolled.current = true
  }, [])

  const handleScrollToToday = useCallback(() => {
    hasUserScrolled.current = false
    recenterOnToday(true)
  }, [recenterOnToday])

  useEffect(() => {
    if (!isCentered) return
    Animated.timing(listOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start()
  }, [isCentered, listOpacity])

  return {
    listRef,
    listOpacity,
    targetScrollOffset,
    handleListLayout,
    handleScrollBeginDrag,
    handleScrollToToday,
  }
}
