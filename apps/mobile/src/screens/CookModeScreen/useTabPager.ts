import { useCallback, useMemo, useState } from 'react'
import { Gesture } from 'react-native-gesture-handler'
import { clamp, runOnJS, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'

export type CookTab = 'steps' | 'ingredients'

const SNAP_MS = 200
const ACTIVATE_OFFSET_X = 12
const FAIL_OFFSET_Y = 14
const VELOCITY_PROJECTION = 0.15

const useTabPager = (pageWidth: number) => {
  const reduceMotion = useReducedMotion()
  const [tab, setTab] = useState<CookTab>('steps')
  const progress = useSharedValue(0)
  const dragStart = useSharedValue(0)
  const snapMs = reduceMotion ? 0 : SNAP_MS

  const settle = useCallback((target: number) => {
    setTab(target === 1 ? 'ingredients' : 'steps')
  }, [])

  const selectTab = useCallback(
    (next: CookTab) => {
      const target = next === 'ingredients' ? 1 : 0

      setTab(next)
      progress.value = withTiming(target, { duration: snapMs })
    },
    [progress, snapMs],
  )

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-ACTIVATE_OFFSET_X, ACTIVATE_OFFSET_X])
        .failOffsetY([-FAIL_OFFSET_Y, FAIL_OFFSET_Y])
        .onBegin(() => {
          dragStart.value = progress.value
        })
        .onUpdate((event) => {
          if (pageWidth === 0) return

          progress.value = clamp(dragStart.value - event.translationX / pageWidth, 0, 1)
        })
        .onEnd((event) => {
          if (pageWidth === 0) return

          const projected = progress.value - (event.velocityX / pageWidth) * VELOCITY_PROJECTION
          const target = projected > 0.5 ? 1 : 0

          runOnJS(settle)(target)
          progress.value = withTiming(target, { duration: snapMs })
        }),
    [dragStart, pageWidth, progress, settle, snapMs],
  )

  return { tab, progress, selectTab, gesture }
}

export default useTabPager
