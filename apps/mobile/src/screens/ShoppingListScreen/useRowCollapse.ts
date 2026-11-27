import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { isMovePhase, type RowPhase } from './helpers'
import {
  CLEAR_EASING,
  CLEAR_FADE_RATIO,
  CLEAR_MS,
  COLLAPSE_EASING,
  COLLAPSE_MS,
  DIM_MS,
  DIM_OPACITY,
  EXPAND_EASING,
  EXPAND_MS,
  NO_MAX_HEIGHT,
} from './motion'

interface UseRowCollapseParams {
  phase: RowPhase
  ticked: boolean
}

const isRestingPhase = (phase: RowPhase) => phase === 'idle' || isMovePhase(phase)

const isCollapsingPhase = (phase: RowPhase) => phase === 'collapsing' || phase === 'removing'

export const useRowCollapse = ({ phase, ticked }: UseRowCollapseParams) => {
  const reduceMotion = useReducedMotion()
  const open = useSharedValue(phase === 'expanding' ? 0 : 1)
  const clear = useSharedValue(phase === 'clearing' ? 1 : 0)
  const dim = useSharedValue(ticked ? DIM_OPACITY : 1)
  const natural = useSharedValue(0)
  const animating = useSharedValue(!isRestingPhase(phase))
  const previousPhaseRef = useRef(phase)

  useLayoutEffect(() => {
    const previous = previousPhaseRef.current
    previousPhaseRef.current = phase

    if (isCollapsingPhase(phase)) {
      animating.value = true
      open.value = reduceMotion ? 0 : withTiming(0, { duration: COLLAPSE_MS, easing: COLLAPSE_EASING })
      return
    }

    if (phase === 'expanding') {
      animating.value = true
      if (!isCollapsingPhase(previous) && previous !== 'expanding') open.value = 0
      open.value = reduceMotion ? 1 : withTiming(1, { duration: EXPAND_MS, easing: EXPAND_EASING })
      return
    }

    if (phase === 'clearing') {
      animating.value = true
      clear.value = reduceMotion ? 1 : withTiming(1, { duration: CLEAR_MS, easing: CLEAR_EASING })
      return
    }

    if (previous === 'clearing') {
      clear.value = withTiming(0, { duration: EXPAND_MS, easing: EXPAND_EASING }, (finished) => {
        'worklet'
        if (finished) animating.value = false
      })
      return
    }

    animating.value = false
    open.value = 1
  }, [phase, reduceMotion, animating, open, clear])

  useEffect(() => {
    const target = ticked ? DIM_OPACITY : 1
    dim.value = reduceMotion ? target : withTiming(target, { duration: DIM_MS })
  }, [ticked, reduceMotion, dim])

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    natural.value = event.nativeEvent.layout.height
  }, [natural])

  // maxHeight only applies while animating so a stale measurement never clips the row after its text wraps differently.
  const wrapperStyle = useAnimatedStyle(() => {
    if (!animating.value) return { maxHeight: NO_MAX_HEIGHT }

    const clearHeight = interpolate(clear.value, [CLEAR_FADE_RATIO, 1], [1, 0], Extrapolation.CLAMP)
    return { maxHeight: natural.value * open.value * clearHeight }
  }, [animating, clear, natural, open])

  const contentStyle = useAnimatedStyle(() => {
    const clearFade = interpolate(clear.value, [0, CLEAR_FADE_RATIO], [1, 0], Extrapolation.CLAMP)
    return { opacity: dim.value * open.value * clearFade }
  }, [dim, open, clear])

  return { handleLayout, wrapperStyle, contentStyle }
}
