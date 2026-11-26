import { useEffect, useMemo } from 'react'
import {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { settleEasing } from '../../theme'
import { GROCERY_QUANTITY_SHIFT, LINK_COLUMN_WIDTH, READ_LEADING_WIDTH } from './ingredientRowLayout'

const TRANSITION_MS = 260
const CHECKBOX_OPACITY_MS = 220
const DIM_MS = 200
const DESELECTED_OPACITY = 0.5
const CHIP_DIMMED_OPACITY = 0.35
const LINK_OPACITY_MS = 200
const LINK_SLIDE = 12
const LEGEND_SLIDE = 12
const CHECKBOX_START_SCALE = 0.6
const SCALE_EASING = Easing.bezierFn(0.2, 0.9, 0.3, 1.2)
const OPACITY_SPAN = TRANSITION_MS / CHECKBOX_OPACITY_MS
const LINK_OPACITY_SPAN = TRANSITION_MS / LINK_OPACITY_MS

export interface GroceryModeTransition {
  progress: SharedValue<number>
  entering: SharedValue<boolean>
  shift: SharedValue<number>
}

export const useGroceryModeTransition = (groceryMode: boolean) => {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(groceryMode ? 1 : 0)
  const entering = useSharedValue(groceryMode)

  useEffect(() => {
    entering.value = groceryMode
    progress.value = withTiming(groceryMode ? 1 : 0, { duration: reduceMotion ? 0 : TRANSITION_MS, easing: Easing.linear })
  }, [groceryMode, reduceMotion, progress, entering])

  const shift = useDerivedValue(() => {
    const p = progress.value

    return entering.value ? settleEasing(p) : 1 - settleEasing(1 - p)
  })

  return useMemo(() => ({ progress, entering, shift }), [progress, entering, shift])
}

export const useGroceryLegendStyles = ({ shift }: GroceryModeTransition) => {
  const legendStyle = useAnimatedStyle(() => ({
    opacity: 1 - shift.value,
    transform: [{ translateX: shift.value * LEGEND_SLIDE }],
  }))
  const countStyle = useAnimatedStyle(() => ({
    opacity: shift.value,
    transform: [{ translateX: -(1 - shift.value) * LEGEND_SLIDE }],
  }))

  return useMemo(() => ({ legendStyle, countStyle }), [legendStyle, countStyle])
}

export const useGroceryRowAnimation = (
  { progress, entering, shift }: GroceryModeTransition,
  groceryMode: boolean,
  selected: boolean,
) => {
  const reduceMotion = useReducedMotion()
  const dimTarget = groceryMode && !selected ? DESELECTED_OPACITY : 1
  const chipTarget = groceryMode ? CHIP_DIMMED_OPACITY : 1
  const contentOpacity = useSharedValue(dimTarget)
  const chipOpacity = useSharedValue(chipTarget)

  useEffect(() => {
    contentOpacity.value = withTiming(dimTarget, { duration: reduceMotion ? 0 : DIM_MS })
  }, [dimTarget, reduceMotion, contentOpacity])

  useEffect(() => {
    chipOpacity.value = withTiming(chipTarget, { duration: reduceMotion ? 0 : DIM_MS })
  }, [chipTarget, reduceMotion, chipOpacity])

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
  const quantityStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateX: shift.value * GROCERY_QUANTITY_SHIFT }],
  }))
  // Column widths change in one step and a transform carries the body across, so no row relayouts per frame.
  const leadingStyle = useAnimatedStyle(() => ({
    width: READ_LEADING_WIDTH + (entering.value ? GROCERY_QUANTITY_SHIFT : 0),
  }))
  const bodyStyle = useAnimatedStyle(() => {
    const offset = entering.value ? -(1 - shift.value) * GROCERY_QUANTITY_SHIFT : shift.value * GROCERY_QUANTITY_SHIFT

    return { transform: [{ translateX: offset }] }
  })
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }))
  const chipStyle = useAnimatedStyle(() => ({ opacity: chipOpacity.value }))
  const linkStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, progress.value * LINK_OPACITY_SPAN),
    transform: [{ translateX: shift.value * LINK_SLIDE }],
  }))

  const linkColumnStyle = useAnimatedStyle(() => ({ width: entering.value ? 0 : LINK_COLUMN_WIDTH }))

  return useMemo(
    () => ({ checkboxStyle, quantityStyle, leadingStyle, bodyStyle, contentStyle, chipStyle, linkStyle, linkColumnStyle }),
    [checkboxStyle, quantityStyle, leadingStyle, bodyStyle, contentStyle, chipStyle, linkStyle, linkColumnStyle],
  )
}
