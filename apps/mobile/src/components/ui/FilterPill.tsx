import { memo, useCallback, useEffect, useMemo, type ReactElement } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { SymbolView, SFSymbol } from 'expo-symbols'
import GlassViewSafe, { glassAvailable } from '../GlassViewSafe'
import { useResolvedColorScheme } from '../../context/ColorSchemeContext'
import { palette, paletteTones, radius, typography, useMotion } from '../../theme'
import { lightHaptic } from './haptics'

export type FilterPillTrailing = 'chevron' | 'clear' | 'none'

interface FilterPillProps {
  label?: string
  icon?: SFSymbol
  active: boolean
  trailing?: FilterPillTrailing
  onPress?: () => void
  onClear?: () => void
  clearLabel?: string
  accessibilityLabel: string
  wrapLabel?: (content: ReactElement) => ReactElement
}

const HEIGHT = 38
const GLYPH_SIZE = 16
const CHEVRON_SIZE = 10
const CLEAR_SIZE = 12
const CLEAR_WIDTH = 30
const TOGGLE_DURATION = 180

const CLEAR_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 8 }

const FilterPill = ({
  label,
  icon,
  active,
  trailing = 'none',
  onPress,
  onClear,
  clearLabel,
  accessibilityLabel,
  wrapLabel,
}: FilterPillProps) => {
  const motion = useMotion()
  const scheme = useResolvedColorScheme()
  const progress = useSharedValue(active ? 1 : 0)

  const toneIndex = scheme === 'dark' ? 1 : 0
  const inactiveTextColor = paletteTones.ink[toneIndex]
  const activeTextColor = paletteTones.onAction[toneIndex]
  const foreground = active ? palette.onAction : palette.ink
  const showClear = active && trailing === 'clear'

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: motion.layout ? TOGGLE_DURATION : 0 })
  }, [active, motion.layout, progress])

  const fillStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveTextColor, activeTextColor]),
  }))

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress?.()
  }, [onPress])

  const handleClear = useCallback(() => {
    lightHaptic()
    onClear?.()
  }, [onClear])

  const segmentStyle = useMemo(
    () => [styles.segment, icon && !label ? styles.iconSegment : styles.labelSegment],
    [icon, label],
  )
  const labelTextStyle = useMemo(() => [typography.button, textStyle, styles.label], [textStyle])

  const segment = (
    <View style={segmentStyle}>
      {icon ? <SymbolView name={icon} size={GLYPH_SIZE} weight="semibold" tintColor={foreground} /> : null}
      {label ? (
        <Animated.Text style={labelTextStyle} numberOfLines={1}>
          {label}
        </Animated.Text>
      ) : null}
      {trailing === 'chevron' ? (
        <SymbolView name="chevron.down" size={CHEVRON_SIZE} weight="bold" tintColor={palette.textSecondary} />
      ) : null}
    </View>
  )

  const pressableSegment = (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
    >
      {segment}
    </Pressable>
  )

  return (
    <Animated.View layout={motion.layout} style={CONTAINER_STYLE}>
      <View style={styles.clip}>
        {glassAvailable ? <GlassViewSafe
            style={StyleSheet.absoluteFill}
            glassEffectStyle="regular"
            tintColor={palette.glassTint}
            isInteractive
          /> : null}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.activeFill, fillStyle]} />
        {wrapLabel ? wrapLabel(segment) : pressableSegment}
        {showClear ? (
          <Animated.View entering={motion.fade} exiting={motion.exiting}>
            <Pressable
              onPress={handleClear}
              hitSlop={CLEAR_HIT_SLOP}
              style={styles.clear}
              accessibilityRole="button"
              accessibilityLabel={clearLabel}
            >
              <SymbolView name="xmark" size={CLEAR_SIZE} weight="bold" tintColor={palette.onAction} />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: { height: HEIGHT, borderRadius: radius.control },
  fallback: {
    backgroundColor: palette.glassFill,
    shadowColor: palette.shadowSoft,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  clip: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: radius.control, overflow: 'hidden' },
  activeFill: { backgroundColor: palette.action },
  segment: { height: HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  labelSegment: { paddingLeft: 14, paddingRight: 12 },
  iconSegment: { width: HEIGHT },
  label: { maxWidth: 160 },
  clear: { width: CLEAR_WIDTH, height: HEIGHT, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
})

const CONTAINER_STYLE = glassAvailable ? styles.container : [styles.container, styles.fallback]

export default memo(FilterPill)
