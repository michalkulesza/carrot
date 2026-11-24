import { useEffect, useState } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { palette } from '../../theme'

interface ProgressBarProps {
  value?: number
}

const HEIGHT = 4
const SEGMENT_RATIO = 0.35
const LOOP_MS = 1100

const ProgressBar = ({ value }: ProgressBarProps) => {
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

  const determinateStyle = { width: `${Math.round(Math.min(1, Math.max(0, value ?? 0)) * 100)}%` as const }

  if (indeterminate && reduceMotion) {
    return (
      <View style={styles.track} onLayout={handleLayout}>
        <View style={[styles.fill, { width: `${SEGMENT_RATIO * 100}%` }]} />
      </View>
    )
  }

  return (
    <View
      style={styles.track}
      onLayout={handleLayout}
      accessibilityRole="progressbar"
      accessibilityValue={indeterminate ? undefined : { min: 0, max: 100, now: Math.round((value ?? 0) * 100) }}
    >
      {indeterminate ? <Animated.View style={[styles.fill, segmentStyle]} /> : <View style={[styles.fill, determinateStyle]} />}
    </View>
  )
}

const styles = StyleSheet.create({
  track: { height: HEIGHT, borderRadius: HEIGHT / 2, backgroundColor: palette.track, overflow: 'hidden' },
  fill: { height: HEIGHT, borderRadius: HEIGHT / 2, backgroundColor: palette.action },
})

export default ProgressBar
