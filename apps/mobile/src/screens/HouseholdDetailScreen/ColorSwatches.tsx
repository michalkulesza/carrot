import { memo, useCallback, useEffect, useMemo } from 'react'
import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated'
import { selectionHaptic } from '../../components/ui/haptics'
import { useResolvedTone } from '../../hooks/useResolvedTone'
import { settleSpring } from '../../theme'
import { colorNameKey, PRESET_COLORS } from './helpers'
import { styles } from './styles'

const SELECTED_SCALE = 1.1

interface SwatchProps {
  color: string
  selected: boolean
  onSelect: (color: string) => void
}

const Swatch = memo(({ color, selected, onSelect }: SwatchProps) => {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(selected ? 1 : 0)
  const ringColor = useResolvedTone('ink')

  useEffect(() => {
    progress.value = reduceMotion ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, settleSpring)
  }, [selected, progress, reduceMotion])

  const swatchStyle = useAnimatedStyle(() => ({
    backgroundColor: color,
    transform: [{ scale: 1 + progress.value * (SELECTED_SCALE - 1) }],
  }))
  const ringStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, progress.value)) }))
  const swatchStyles = useMemo(() => [styles.swatch, swatchStyle], [swatchStyle])
  const ringStyles = useMemo(() => [styles.swatchRing, { borderColor: ringColor }, ringStyle], [ringColor, ringStyle])
  const accessibilityState = useMemo(() => ({ checked: selected }), [selected])

  const handlePress = useCallback(() => {
    if (selected) return

    selectionHaptic()
    onSelect(color)
  }, [selected, onSelect, color])

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={4}
      accessibilityRole="radio"
      accessibilityLabel={t(colorNameKey(color))}
      accessibilityState={accessibilityState}
    >
      <View style={styles.swatchSlot}>
        <Animated.View style={swatchStyles} />
        <Animated.View style={ringStyles} pointerEvents="none" />
      </View>
    </Pressable>
  )
})

interface ColorSwatchesProps {
  color: string
  onSelect: (color: string) => void
}

const ColorSwatches = ({ color, onSelect }: ColorSwatchesProps) => (
  <View style={styles.swatches} accessibilityRole="radiogroup">
    {PRESET_COLORS.map((preset) => (
      <Swatch key={preset} color={preset} selected={preset === color} onSelect={onSelect} />
    ))}
  </View>
)

export default memo(ColorSwatches)
