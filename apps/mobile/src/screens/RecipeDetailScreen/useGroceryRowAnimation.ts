import { useEffect, useMemo, useState } from 'react'
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { settleEasing } from '../../theme'

export const GROCERY_QUANTITY_SHIFT = 32

const TRANSITION_MS = 260
const CHECKBOX_OPACITY_MS = 220
const DIM_MS = 200
const DESELECTED_OPACITY = 0.45
const CHECKBOX_START_SCALE = 0.6
const SCALE_EASING = Easing.bezierFn(0.2, 0.9, 0.3, 1.2)
const OPACITY_SPAN = TRANSITION_MS / CHECKBOX_OPACITY_MS

export interface GroceryModeTransition {
  progress: SharedValue<number>
  entering: SharedValue<boolean>
}

export const useGroceryModeTransition = (groceryMode: boolean) => {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(groceryMode ? 1 : 0)
  const entering = useSharedValue(groceryMode)
  const [checkboxesMounted, setCheckboxesMounted] = useState(groceryMode)

  useEffect(() => {
    entering.value = groceryMode
    if (groceryMode) setCheckboxesMounted(true)

    const unmountCheckboxes = (finished?: boolean) => {
      'worklet'
      if (finished && !groceryMode) runOnJS(setCheckboxesMounted)(false)
    }

    progress.value = withTiming(
      groceryMode ? 1 : 0,
      { duration: reduceMotion ? 0 : TRANSITION_MS, easing: Easing.linear },
      unmountCheckboxes,
    )
  }, [groceryMode, reduceMotion, progress, entering])

  const transition = useMemo(() => ({ progress, entering }), [progress, entering])

  return { transition, checkboxesMounted }
}

export const useGroceryRowAnimation = (
  { progress, entering }: GroceryModeTransition,
  groceryMode: boolean,
  selected: boolean,
) => {
  const reduceMotion = useReducedMotion()
  const dimTarget = groceryMode && !selected ? DESELECTED_OPACITY : 1
  const rowOpacity = useSharedValue(dimTarget)

  useEffect(() => {
    rowOpacity.value = withTiming(dimTarget, { duration: reduceMotion ? 0 : DIM_MS })
  }, [dimTarget, reduceMotion, rowOpacity])

  const checkboxStyle = useAnimatedStyle(() => {
    const p = progress.value

    if (entering.value) {
      return {
        opacity: Math.min(1, p * OPACITY_SPAN),
        transform: [{ scale: CHECKBOX_START_SCALE + (1 - CHECKBOX_START_SCALE) * SCALE_EASING(p) }],
      }
    }

    const elapsed = 1 - p
    const outCubic = 1 - (1 - elapsed) ** 3

    return {
      opacity: 1 - Math.min(1, elapsed * OPACITY_SPAN),
      transform: [{ scale: 1 - (1 - CHECKBOX_START_SCALE) * outCubic }],
    }
  })
  const quantityStyle = useAnimatedStyle(() => {
    const p = progress.value
    const shift = entering.value ? settleEasing(p) : 1 - settleEasing(1 - p)

    return { transform: [{ translateX: shift * GROCERY_QUANTITY_SHIFT }] }
  })
  const rowStyle = useAnimatedStyle(() => ({ opacity: rowOpacity.value }))

  return useMemo(() => ({ checkboxStyle, quantityStyle, rowStyle }), [checkboxStyle, quantityStyle, rowStyle])
}
