import { useCallback, useMemo } from 'react'
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated'

export const enterFade = FadeInDown.duration(250)
export const exitFade = FadeOut.duration(160)
export const fadeIn = FadeIn.duration(220)
export const layout = LinearTransition.duration(200)

export const settleSpring = { damping: 24, stiffness: 240, mass: 1 }

const ROW_EXIT_TIMING = { duration: 220, easing: Easing.out(Easing.cubic) }

export const rowEnter = FadeInDown.springify().damping(settleSpring.damping).stiffness(settleSpring.stiffness)
export const rowLayout = LinearTransition.springify().damping(settleSpring.damping).stiffness(settleSpring.stiffness)

export const rowExit: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(0, ROW_EXIT_TIMING),
      transform: [{ scale: withTiming(0.94, ROW_EXIT_TIMING) }],
    },
  }
}

export const PRESS_SCALE = 0.97

const PRESS_SPRING = { damping: 18, stiffness: 320 }

export const useMotion = () => {
  const reduceMotion = useReducedMotion()

  return useMemo(
    () =>
      reduceMotion
        ? {
            entering: undefined,
            fade: undefined,
            exiting: undefined,
            layout: undefined,
            rowEntering: undefined,
            rowExiting: undefined,
            rowLayout: undefined,
          }
        : { entering: enterFade, fade: fadeIn, exiting: exitFade, layout, rowEntering: rowEnter, rowExiting: rowExit, rowLayout },
    [reduceMotion],
  )
}

export const usePressScale = (scale = PRESS_SCALE) => {
  const pressed = useSharedValue(0)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scale) }],
  }))

  const onPressIn = useCallback(() => {
    pressed.value = withSpring(1, PRESS_SPRING)
  }, [pressed])

  const onPressOut = useCallback(() => {
    pressed.value = withSpring(0, PRESS_SPRING)
  }, [pressed])

  return { animatedStyle, onPressIn, onPressOut }
}

export const expandTiming = { duration: 260, easing: Easing.out(Easing.cubic) }

export const settleEasing = Easing.bezierFn(0.2, 0.8, 0.2, 1)
