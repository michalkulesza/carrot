import { memo, useCallback, useMemo } from 'react'
import { Pressable, View, type Insets } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { palette } from '../../theme'
import { useResolvedTone } from '../../hooks/useResolvedTone'
import { selectionHaptic, lightHaptic } from './haptics'
import { CHECKBOX_SIZE, checkboxStyles, TICK_RATIO, useCheckProgress } from './checkboxShared'

type CheckboxHaptic = 'selection' | 'light' | 'none'

interface CheckboxProps {
  checked: boolean
  onToggle: () => void
  accessibilityLabel: string
  celebrate?: boolean
  haptic?: CheckboxHaptic
  hitSlop?: Insets
}

interface CheckboxCircleProps {
  checked: boolean
  itemKey?: string
  size?: number
  celebrate?: boolean
}

const HIT_SLOP = { top: 9, bottom: 9, left: 9, right: 9 }

const HAPTICS: Record<CheckboxHaptic, (() => void) | null> = {
  selection: selectionHaptic,
  light: lightHaptic,
  none: null,
}

const POP_PEAK = 1.25
const POP_UP_MS = 180
const POP_DOWN_MS = 270
const POP_EASING = Easing.bezierFn(0.2, 0.9, 0.3, 1.4)

export const CheckboxCircle = memo(({ checked, itemKey, size = CHECKBOX_SIZE, celebrate = false }: CheckboxCircleProps) => {
  const pop = useSharedValue(1)
  const ringColor = useResolvedTone('checkboxRing')

  const playPop = useCallback(() => {
    pop.value = withSequence(
      withTiming(POP_PEAK, { duration: POP_UP_MS, easing: POP_EASING }),
      withTiming(1, { duration: POP_DOWN_MS, easing: POP_EASING }),
    )
  }, [pop])

  const progress = useCheckProgress(checked, itemKey, celebrate ? playPop : undefined)

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }))
  const fillStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  const circleStyle = useMemo(
    () => [checkboxStyles.circle, { width: size, height: size, borderRadius: size / 2, borderColor: ringColor }],
    [size, ringColor],
  )
  const fillStyles = useMemo(
    () => [checkboxStyles.fill, { borderRadius: size / 2 }, fillStyle],
    [size, fillStyle],
  )

  return (
    <Animated.View style={popStyle}>
      <View style={circleStyle}>
        <Animated.View style={fillStyles}>
          <SymbolView name="checkmark" size={Math.round(size * TICK_RATIO)} weight="bold" tintColor={palette.onImage} />
        </Animated.View>
      </View>
    </Animated.View>
  )
})

const Checkbox = ({
  checked,
  onToggle,
  accessibilityLabel,
  celebrate = false,
  haptic = 'selection',
  hitSlop = HIT_SLOP,
}: CheckboxProps) => {
  const handlePress = useCallback(() => {
    HAPTICS[haptic]?.()
    onToggle()
  }, [haptic, onToggle])

  const accessibilityState = useMemo(() => ({ checked }), [checked])

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={hitSlop}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
    >
      <CheckboxCircle checked={checked} celebrate={celebrate} />
    </Pressable>
  )
}

export default memo(Checkbox)
