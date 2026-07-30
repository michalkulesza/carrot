import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Animated, type LayoutChangeEvent } from 'react-native'
import ReanimatedAnimated, { useAnimatedRef } from 'react-native-reanimated'
import type { ListItem } from './helpers'

export const useCenterOnToday = ({
  todayIndex,
  isFocused,
}: {
  todayIndex: number
  isFocused: boolean
}) => {
  const listRef = useAnimatedRef<ReanimatedAnimated.FlatList<ListItem>>()
  const hasUserScrolled = useRef(false)
  const hasInitiallyCentered = useRef(false)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [listOpacity] = useState(() => new Animated.Value(0))

  const scrollToToday = useCallback(
    (animated: boolean) => {
      listRef.current?.scrollToIndex({ index: todayIndex, viewPosition: 0.5, animated })
    },
    [listRef, todayIndex],
  )

  useLayoutEffect(() => {
    if (!isFocused || viewportHeight == null || hasUserScrolled.current) return
    if (listRef.current == null) return

    scrollToToday(false)

    if (hasInitiallyCentered.current) return

    hasInitiallyCentered.current = true
    Animated.timing(listOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start()
  }, [isFocused, viewportHeight, listRef, scrollToToday, listOpacity])

  const handleListLayout = useCallback((e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout
    if (height <= 0) return

    setViewportHeight((currentHeight) => (currentHeight === height ? currentHeight : height))
  }, [])

  const handleScrollBeginDrag = useCallback(() => {
    hasUserScrolled.current = true
  }, [])

  const handleScrollToToday = useCallback(() => {
    hasUserScrolled.current = false
    if (!isFocused || viewportHeight == null) return

    scrollToToday(true)
  }, [isFocused, viewportHeight, scrollToToday])

  return {
    listRef,
    listOpacity,
    handleListLayout,
    handleScrollBeginDrag,
    handleScrollToToday,
  }
}
