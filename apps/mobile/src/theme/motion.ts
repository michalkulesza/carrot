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
} from 'react-native-reanimated'

export const enterFade = FadeInDown.duration(250)
export const exitFade = FadeOut.duration(160)
export const fadeIn = FadeIn.duration(220)
export const layout = LinearTransition.duration(200)

export const PRESS_SCALE = 0.97

const PRESS_SPRING = { damping: 18, stiffness: 320 }

export const useMotion = () => {
  const reduceMotion = useReducedMotion()

  return useMemo(
    () =>
      reduceMotion
        ? { entering: undefined, fade: undefined, exiting: undefined, layout: undefined }
        : { entering: enterFade, fade: fadeIn, exiting: exitFade, layout },
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
