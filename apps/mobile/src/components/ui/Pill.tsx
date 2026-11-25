import { memo, useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import Animated from 'react-native-reanimated'
import { palette, radius, typography, usePressScale } from '../../theme'
import { lightHaptic } from './haptics'

export type PillTone = 'tint' | 'neutral'
export type PillSize = 'sm' | 'md'

interface PillProps {
  label: string
  tone?: PillTone
  size?: PillSize
  onPress?: () => void
  onRemove?: () => void
  removeAccessibilityLabel?: string
  accessibilityLabel?: string
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
})

const SIZE_TEXTS = { sm: typography.pillSmall, md: typography.pillMedium }

const HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 }
const REMOVE_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 10 }
const REMOVE_ICON_SIZE = 10

const Pill = ({ label, tone = 'tint', size = 'sm', onPress, onRemove, removeAccessibilityLabel, accessibilityLabel }: PillProps) => {
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

const styles = StyleSheet.create({
  container: { flexShrink: 1, alignSelf: 'flex-start' },
  pressable: { flexShrink: 1, alignSelf: 'flex-start' },
  removable: { flexDirection: 'row', alignItems: 'center', gap: 6 },
})

export default memo(Pill)
