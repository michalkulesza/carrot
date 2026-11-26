import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { palette } from '../../theme'
import { selectionHaptic } from './haptics'

interface CheckboxProps {
  checked: boolean
  onToggle: () => void
  accessibilityLabel: string
}

export const CHECKBOX_SIZE = 26
const TICK_SIZE = 13
const TOGGLE_MS = 180
const RING_WIDTH = 1.5
const HIT_SLOP = { top: 9, bottom: 9, left: 9, right: 9 }

// `itemKey` identifies the row: when a recycled list cell is reused for another item the state jumps instead of animating.
export const CheckboxCircle = memo(({ checked, itemKey }: { checked: boolean; itemKey?: string }) => {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(checked ? 1 : 0)
  const itemKeyRef = useRef(itemKey)

  useLayoutEffect(() => {
    const recycled = itemKeyRef.current !== itemKey
    itemKeyRef.current = itemKey

    progress.value =
      reduceMotion || recycled ? Number(checked) : withTiming(Number(checked), { duration: TOGGLE_MS })
  }, [checked, itemKey, progress, reduceMotion])

  const fillStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  const fillStyles = useMemo(() => [styles.fill, fillStyle], [fillStyle])

  return (
    <View style={styles.circle}>
      <Animated.View style={fillStyles}>
        <SymbolView name="checkmark" size={TICK_SIZE} weight="bold" tintColor={palette.onImage} />
      </Animated.View>
    </View>
  )
})

const Checkbox = ({ checked, onToggle, accessibilityLabel }: CheckboxProps) => {
  const handlePress = useCallback(() => {
    selectionHaptic()
    onToggle()
  }, [onToggle])

  const accessibilityState = useMemo(() => ({ checked }), [checked])

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={HIT_SLOP}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
    >
      <CheckboxCircle checked={checked} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  circle: {
    width: CHECKBOX_SIZE,
    height: CHECKBOX_SIZE,
    borderRadius: CHECKBOX_SIZE / 2,
    borderWidth: RING_WIDTH,
    borderColor: palette.ring,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    ...StyleSheet.absoluteFill,
    margin: -RING_WIDTH,
    borderRadius: CHECKBOX_SIZE / 2,
    backgroundColor: palette.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default memo(Checkbox)
