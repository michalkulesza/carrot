import { useEffect, useMemo, useState } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { palette, PaletteKey } from '../../theme'

interface ProgressBarProps {
  value?: number
  size?: 'regular' | 'thick'
  tone?: PaletteKey
  trackTone?: PaletteKey
}

const HEIGHTS = { regular: 4, thick: 6 }
const SEGMENT_RATIO = 0.35
const LOOP_MS = 1100
const FILL_MS = 250

const ProgressBar = ({ value, size = 'regular', tone = 'action', trackTone = 'track' }: ProgressBarProps) => {
  const height = HEIGHTS[size]
  const trackStyle = useMemo(
    () => [styles.track, { height, borderRadius: height / 2, backgroundColor: palette[trackTone] }],
    [height, trackTone],
  )
  const fillStyle = useMemo(
    () => [{ height, borderRadius: height / 2, backgroundColor: palette[tone] }],
    [height, tone],
  )
  const reduceMotion = useReducedMotion()
  const [width, setWidth] = useState(0)
  const progress = useSharedValue(0)
  const indeterminate = value === undefined

  useEffect(() => {
    if (!indeterminate || reduceMotion) {
      progress.value = 0
      return
    }

    progress.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.inOut(Easing.ease) }), -1, false)
  }, [indeterminate, reduceMotion, progress])

  const handleLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)

  const segmentWidth = width * SEGMENT_RATIO

  const segmentStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: -segmentWidth + progress.value * (width + segmentWidth) }],
  }))

  const clampedValue = Math.min(1, Math.max(0, value ?? 0))
  const fillProgress = useSharedValue(clampedValue)

  useEffect(() => {
    fillProgress.value = reduceMotion ? clampedValue : withTiming(clampedValue, { duration: FILL_MS })
  }, [clampedValue, fillProgress, reduceMotion])

  const determinateStyle = useAnimatedStyle(() => ({ width: `${fillProgress.value * 100}%` }))

  if (indeterminate && reduceMotion) {
    return (
      <View style={trackStyle} onLayout={handleLayout}>
        <View style={[fillStyle, { width: `${SEGMENT_RATIO * 100}%` }]} />
      </View>
    )
  }

  return (
    <View
      style={trackStyle}
      onLayout={handleLayout}
      accessibilityRole="progressbar"
      accessibilityValue={indeterminate ? undefined : { min: 0, max: 100, now: Math.round((value ?? 0) * 100) }}
    >
      {indeterminate ? <Animated.View style={[fillStyle, segmentStyle]} /> : <Animated.View style={[fillStyle, determinateStyle]} />}
    </View>
  )
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
})

export default ProgressBar
