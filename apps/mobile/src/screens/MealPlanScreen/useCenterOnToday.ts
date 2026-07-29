import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, type LayoutChangeEvent } from 'react-native'
import {
  useSafeAreaFrame,
  useSafeAreaInsets,
  type EdgeInsets,
  type Rect,
} from 'react-native-safe-area-context'
import ReanimatedAnimated, { useAnimatedRef } from 'react-native-reanimated'
import { DAY_ROW_HEIGHT, type ListItem } from './helpers'

// scrollToIndex's viewPosition centers against the FlatList's raw frame height,
// which — because headerTransparent lets content render behind the header, and
// the tab bar floats over content too — equals the full window height, not the
// space actually visible between them. Compute the target offset manually
// against the visible strip [header bottom, tab bar top] instead, and apply it
// with scrollToOffset.
//
// The bottom of that strip cannot come from useSafeAreaInsets(): expo-router gives
// every native tab its own SafeAreaProvider, which seeds from the parent window
// provider and only swaps in the tab-scoped insets (the ones that include the tab
// bar) a render later. On the first visit to this tab that first render is a guess,
// so measure the insets natively through SafeAreaListener and keep the screen hidden
// until the measurement lands.
//
// That measurement is a single native callback that can legitimately never arrive —
// SafeAreaProvider skips the emit while the view has a zero frame, and Fabric view
// recycling can leave its already-sent flag reset with no further layout pass. Since
// the list is hidden at opacity 0 over an opaque background, a missed callback used
// to mean a permanent black screen. Fall back to the context values shortly after
// mount so the screen always reveals; a late native measurement still corrects it.

const MEASUREMENT_FALLBACK_MS = 250

interface MeasuredScreen {
  bottomInset: number
  height: number
}

export const useCenterOnToday = ({
  offsets,
  todayIndex,
  headerHeight,
}: {
  offsets: number[]
  todayIndex: number
  headerHeight: number
}) => {
  const listRef = useAnimatedRef<ReanimatedAnimated.FlatList<ListItem>>()
  const hasUserScrolled = useRef(false)
  const [screen, setScreen] = useState<MeasuredScreen | null>(null)
  const [isCentered, setIsCentered] = useState(false)
  const listOpacity = useRef(new Animated.Value(0)).current

  const contextInsets = useSafeAreaInsets()
  const contextFrame = useSafeAreaFrame()
  const fallbackScreen = useRef<MeasuredScreen>({ bottomInset: 0, height: 0 })
  fallbackScreen.current = { bottomInset: contextInsets.bottom, height: contextFrame.height }

  const handleSafeAreaChange = useCallback(({ insets, frame }: { insets: EdgeInsets; frame: Rect }) => {
    setScreen({ bottomInset: insets.bottom, height: frame.height })
  }, [])

  useEffect(() => {
    const timer = setTimeout(
      () => setScreen((measured) => measured ?? fallbackScreen.current),
      MEASUREMENT_FALLBACK_MS,
    )
    return () => clearTimeout(timer)
  }, [])

  const targetScrollOffset = useMemo(() => {
    if (screen == null) return 0

    const todayOffset = offsets[todayIndex] ?? 0
    const visibleCenter = (headerHeight + (screen.height - screen.bottomInset)) / 2

    return Math.max(0, todayOffset - visibleCenter + DAY_ROW_HEIGHT / 2)
  }, [offsets, todayIndex, headerHeight, screen])

  const recenterOnToday = useCallback((animated: boolean) => {
    if (hasUserScrolled.current) return
    listRef.current?.scrollToOffset({ offset: targetScrollOffset, animated })
  }, [targetScrollOffset])

  useEffect(() => {
    if (screen == null) return
    recenterOnToday(false)
    setIsCentered(true)
  }, [screen, recenterOnToday])

  // Re-apply on later layout changes in case the first call landed before the
  // FlatList was fully attached — a cheap no-op otherwise.
  const handleListLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      if (screen == null) return
      recenterOnToday(false)
    },
    [screen, recenterOnToday],
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
    bottomInset: screen?.bottomInset ?? null,
    targetScrollOffset,
    handleSafeAreaChange,
    handleListLayout,
    handleScrollBeginDrag,
    handleScrollToToday,
  }
}
