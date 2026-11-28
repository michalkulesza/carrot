import { memo, useCallback, useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated'
import { palette, radius, settleSpring, typography, usePressScale } from '../../theme'
import { useResolvedTone } from '../../hooks/useResolvedTone'
import { lightHaptic, selectionHaptic } from './haptics'

export type PillTone = 'tint' | 'neutral'
export type PillSize = 'sm' | 'md' | 'lg'

interface PillProps {
  label: string
  tone?: PillTone
  size?: PillSize
  onPress?: () => void
  onRemove?: () => void
  removeAccessibilityLabel?: string
  accessibilityLabel?: string
  selected?: boolean
}

const BACKGROUNDS: Record<PillTone, string> = {
  tint: palette.tint,
  neutral: palette.control,
}

const FOREGROUNDS: Record<PillTone, string> = {
  tint: palette.actionText,
  neutral: palette.textSecondary,
}

const SIZE_BOXES = StyleSheet.create({
  sm: { borderRadius: radius.input, paddingVertical: 3, paddingHorizontal: 9 },
  md: { borderRadius: radius.control, paddingVertical: 5, paddingHorizontal: 11 },
  lg: { borderRadius: radius.control, minHeight: 38, paddingVertical: 8, paddingHorizontal: 14, justifyContent: 'center' },
})

const SIZE_TEXTS = { sm: typography.pillSmall, md: typography.pillMedium, lg: typography.button }

const HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 }
const REMOVE_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 10 }
const REMOVE_ICON_SIZE = 10

const StaticPill = ({ label, tone = 'tint', size = 'sm', onPress, onRemove, removeAccessibilityLabel, accessibilityLabel }: PillProps) => {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()

  const containerStyle = useMemo(
    () => [styles.container, SIZE_BOXES[size], { backgroundColor: BACKGROUNDS[tone] }],
    [size, tone],
  )
  const pressableContainerStyle = useMemo(() => [containerStyle, animatedStyle], [containerStyle, animatedStyle])
  const textStyle = useMemo(() => [SIZE_TEXTS[size], { color: FOREGROUNDS[tone] }], [size, tone])

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress?.()
  }, [onPress])

  const handleRemove = useCallback(() => {
    lightHaptic()
    onRemove?.()
  }, [onRemove])

  if (onRemove) {
    return (
      <View style={[containerStyle, styles.removable]}>
        <Text style={textStyle} numberOfLines={1}>
          {label}
        </Text>
        <Pressable
          onPress={handleRemove}
          hitSlop={REMOVE_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={removeAccessibilityLabel ?? label}
        >
          <SymbolView name="xmark" size={REMOVE_ICON_SIZE} weight="bold" tintColor={FOREGROUNDS[tone]} />
        </Pressable>
      </View>
    )
  }

  if (!onPress) {
    return (
      <View style={containerStyle}>
        <Text style={textStyle} numberOfLines={1}>
          {label}
        </Text>
      </View>
    )
  }

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={HIT_SLOP}
      style={styles.pressable}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Animated.View style={pressableContainerStyle}>
        <Text style={textStyle} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const SELECT_SCALE_BUMP = 0.04
const SELECTED_BORDER = 1.5

const SelectablePill = ({
  label,
  size = 'lg',
  selected = false,
  onPress,
  accessibilityLabel,
}: PillProps) => {
  const reduceMotion = useReducedMotion()
  const { animatedStyle: pressStyle, onPressIn, onPressOut } = usePressScale()
  const progress = useSharedValue(selected ? 1 : 0)
  const restingBorder = useResolvedTone('dividerStrong')
  const restingText = useResolvedTone('ink')
  const selectedText = useResolvedTone('onAction')

  useEffect(() => {
    progress.value = reduceMotion ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, settleSpring)
  }, [selected, progress, reduceMotion])

  const overlayStyle = useAnimatedStyle(() => {
    const clamped = Math.min(1, Math.max(0, progress.value))

    return {
      opacity: clamped,
      transform: [{ scale: 1 + Math.sin(clamped * Math.PI) * SELECT_SCALE_BUMP }],
    }
  })

  const animatedTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(Math.min(1, Math.max(0, progress.value)), [0, 1], [restingText, selectedText]),
  }))

  const handlePress = useCallback(() => {
    selectionHaptic()
    onPress?.()
  }, [onPress])

  const boxStyle = useMemo(
    () => [styles.selectableBox, SIZE_BOXES[size], { borderColor: restingBorder }, pressStyle],
    [size, restingBorder, pressStyle],
  )
  const overlay = useMemo(
    () => [styles.selectedOverlay, { borderRadius: SIZE_BOXES[size].borderRadius }, overlayStyle],
    [size, overlayStyle],
  )
  const textStyle = useMemo(() => [SIZE_TEXTS[size], animatedTextStyle], [size, animatedTextStyle])
  const accessibilityState = useMemo(() => ({ selected }), [selected])

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={HIT_SLOP}
      style={styles.pressable}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={accessibilityState}
    >
      <Animated.View style={boxStyle}>
        <Animated.View style={overlay} pointerEvents="none" />
        <Animated.Text style={textStyle}>{label}</Animated.Text>
      </Animated.View>
    </Pressable>
  )
}

const Pill = (props: PillProps) =>
  props.selected === undefined ? <StaticPill {...props} /> : <SelectablePill {...props} />

const styles = StyleSheet.create({
  selectableBox: {
    backgroundColor: palette.background,
    borderWidth: SELECTED_BORDER,
  },
  selectedOverlay: {
    position: 'absolute',
    top: -SELECTED_BORDER,
    left: -SELECTED_BORDER,
    right: -SELECTED_BORDER,
    bottom: -SELECTED_BORDER,
    backgroundColor: palette.action,
  },
  container: { flexShrink: 1, alignSelf: 'flex-start' },
  pressable: { flexShrink: 1, alignSelf: 'flex-start' },
  removable: { flexDirection: 'row', alignItems: 'center', gap: 6 },
})

export default memo(Pill)
