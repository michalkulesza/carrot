import { useLayoutEffect, useRef } from 'react'
import { StyleSheet } from 'react-native'
import { useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { palette } from '../../theme'

export const CHECKBOX_SIZE = 26
export const TICK_RATIO = 0.5
export const RING_WIDTH = 1.5
const TOGGLE_MS = 180

export const checkboxStyles = StyleSheet.create({
  circle: {
    borderWidth: RING_WIDTH,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    ...StyleSheet.absoluteFill,
    margin: -RING_WIDTH,
    backgroundColor: palette.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

// `itemKey` identifies the row: when a recycled list cell is reused for another item the state jumps instead of animating.
export const useCheckProgress = (checked: boolean, itemKey?: string, onChecked?: () => void) => {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(checked ? 1 : 0)
  const itemKeyRef = useRef(itemKey)
  const checkedRef = useRef(checked)

  useLayoutEffect(() => {
    const recycled = itemKeyRef.current !== itemKey
    const wasChecked = checkedRef.current
    itemKeyRef.current = itemKey
    checkedRef.current = checked

    const instant = reduceMotion || recycled
    if (onChecked && checked && !wasChecked && !instant) {
      progress.value = 1
      onChecked()
      return
    }

    progress.value = instant ? Number(checked) : withTiming(Number(checked), { duration: TOGGLE_MS })
  }, [checked, itemKey, onChecked, progress, reduceMotion])

  return progress
}
