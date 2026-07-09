import { useEffect, useRef } from 'react'
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

const PAUSE_MS = 1200
const SPEED_PX_PER_SEC = 28

// Drives one pause-scroll-pause-scroll-back cycle of a marquee's translateX
// whenever `turn` changes to a non-null value, then reports completion via
// onDone so a MarqueeSyncProvider can hand the turn to the next participant
// instead of every marquee scrolling simultaneously and independently.
export const useMarqueeAnimation = (
  contentWidth: number,
  containerWidth: number,
  turn: number | null,
  onOverflowChange: (overflows: boolean) => void,
  onDone: () => void,
) => {
  const translateX = useSharedValue(0)
  const onOverflowChangeRef = useRef(onOverflowChange)
  onOverflowChangeRef.current = onOverflowChange
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const overflow = contentWidth - containerWidth
    onOverflowChangeRef.current(overflow > 0 && containerWidth > 0)
  }, [contentWidth, containerWidth])

  useEffect(() => {
    const overflow = contentWidth - containerWidth
    const overflows = overflow > 0 && containerWidth > 0

    if (turn === null || !overflows) {
      cancelAnimation(translateX)
      translateX.value = 0
      return
    }

    translateX.value = 0
    const duration = (overflow / SPEED_PX_PER_SEC) * 1000
    translateX.value = withSequence(
      withDelay(PAUSE_MS, withTiming(-overflow, { duration, easing: Easing.linear })),
      withDelay(
        PAUSE_MS,
        withTiming(0, { duration, easing: Easing.linear }, (finished) => {
          if (finished) runOnJS(onDoneRef.current)()
        }),
      ),
    )
    return () => cancelAnimation(translateX)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth, containerWidth, turn])

  return useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))
}
