import { memo, useEffect, useRef } from 'react'
import { StyleSheet } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useResolvedColorScheme } from '../../context/ColorSchemeContext'
import { paletteTones, settleEasing, withAlpha } from '../../theme'
import GroceryBarButton from './GroceryBarButton'
import { getGroceryBottomOffset } from './groceryLayout'
import { styles } from './styles'

interface GroceryModeBarProps {
  active: boolean
  count: number
  onCancel: () => void
  onConfirm: () => void
}

const GRADIENT_SOLID_STOP = 0.4
const OPACITY_MS = 220
const SLIDE_MS = 300
const SLIDE_DISTANCE = 24

const GroceryModeBar = ({ active, count, onCancel, onConfirm }: GroceryModeBarProps) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const scheme = useResolvedColorScheme()
  const reduceMotion = useReducedMotion()
  const visibleCountRef = useRef(count)
  const progress = useSharedValue(0)
  const slide = useSharedValue(SLIDE_DISTANCE)

  if (active) visibleCountRef.current = count

  useEffect(() => {
    const target = active ? 1 : 0

    progress.value = withTiming(target, { duration: reduceMotion ? 0 : OPACITY_MS })
    slide.value = withTiming(active ? 0 : SLIDE_DISTANCE, {
      duration: reduceMotion ? 0 : SLIDE_MS,
      easing: settleEasing,
    })
  }, [active, reduceMotion, progress, slide])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: slide.value }],
  }))

  const solid = paletteTones.background[scheme === 'dark' ? 1 : 0]
  const gradientColors = [withAlpha(solid, 0), solid, solid] as const
  const gradientLocations = [0, GRADIENT_SOLID_STOP, 1] as const

  const barCount = visibleCountRef.current
  const barStyle = [styles.groceryBar, { paddingBottom: getGroceryBottomOffset(insets.bottom) }, animatedStyle]
  const confirmLabel = barCount > 0 ? t('recipes.addItemsCount', { count: barCount }) : t('recipes.selectItems')

  return (
    <Animated.View style={barStyle} pointerEvents={active ? 'box-none' : 'none'}>
      <LinearGradient
        colors={gradientColors}
        locations={gradientLocations}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <GroceryBarButton tone="surface" label={t('common.cancel')} onPress={onCancel} haptic />
      <GroceryBarButton
        tone="action"
        icon="cart"
        label={confirmLabel}
        onPress={onConfirm}
        disabled={barCount === 0}
      />
    </Animated.View>
  )
}

export default memo(GroceryModeBar)
