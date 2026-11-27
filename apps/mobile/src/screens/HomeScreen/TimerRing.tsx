import { memo, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { AppText } from '../../components/ui'
import { palette } from '../../theme'
import { getTimerTone, type TimerState } from './timerHelpers'

interface TimerRingProps {
  count: number
  progress: number
  state: TimerState
}

const SIZE = 36
const STROKE = 3
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const PULSE_MS = 800
const PULSE_MIN_OPACITY = 0.45
const COUNT_MAX_FONT_SCALE = 1.3

const TimerRing = ({ count, progress, state }: TimerRingProps) => {
  const reduceMotion = useReducedMotion()
  const opacity = useSharedValue(1)
  const done = state === 'done'
  const clampedProgress = Math.min(1, Math.max(0, progress))
  const dashOffset = CIRCUMFERENCE * (1 - (done ? 1 : clampedProgress))

  useEffect(() => {
    if (!done || reduceMotion) {
      opacity.value = 1
      return
    }

    opacity.value = withRepeat(
      withSequence(withTiming(PULSE_MIN_OPACITY, { duration: PULSE_MS }), withTiming(1, { duration: PULSE_MS })),
      -1,
      false,
    )

    return () => cancelAnimation(opacity)
  }, [opacity, done, reduceMotion])

  const ringStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <View style={styles.circle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.ring, ringStyle]}>
        <Svg width={SIZE} height={SIZE} style={styles.svg}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke={palette.track} strokeWidth={STROKE} fill="none" />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={palette[getTimerTone(state)]}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </Svg>
      </Animated.View>
      <AppText variant="tileTitle" style={styles.count} tabular maxFontSizeMultiplier={COUNT_MAX_FONT_SCALE}>
        {count}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: StyleSheet.absoluteFill,
  svg: { transform: [{ rotate: '-90deg' }] },
  count: { fontWeight: '700' },
})

export default memo(TimerRing)
