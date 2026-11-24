import { memo, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { settleSpring } from '../../theme'

type Direction = 1 | -1

interface RollingNumberProps {
  value: number
  lineHeight: number
  style?: StyleProp<TextStyle>
  accessibilityLabel?: string
}

interface RollingDigitProps {
  digit: string
  direction: Direction
  lineHeight: number
  style?: StyleProp<TextStyle>
}

const placeEnter = FadeIn.duration(180)
const placeExit = FadeOut.duration(140)

const RollingDigit = memo(({ digit, direction, lineHeight, style }: RollingDigitProps) => {
  const reduceMotion = useReducedMotion()
  const [current, setCurrent] = useState(digit)
  const [previous, setPrevious] = useState<string | null>(null)
  const progress = useSharedValue(1)

  if (digit !== current) {
    setPrevious(current)
    setCurrent(digit)
  }

  useEffect(() => {
    if (previous === null) return

    if (reduceMotion) {
      progress.value = 1
      return
    }

    progress.value = 0
    progress.value = withSpring(1, settleSpring)
  }, [current, previous, progress, reduceMotion])

  const incomingStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * lineHeight * direction }],
  }))

  const outgoingStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: -progress.value * lineHeight * direction }],
  }))

  const cellStyle = useMemo(() => [styles.cell, { height: lineHeight }], [lineHeight])

  return (
    <View style={cellStyle}>
      <Animated.Text style={[style, incomingStyle]}>{current}</Animated.Text>
      {previous !== null ? (
        <Animated.Text style={[style, styles.outgoing, outgoingStyle]}>{previous}</Animated.Text>
      ) : null}
    </View>
  )
})

const RollingNumber = ({ value, lineHeight, style, accessibilityLabel }: RollingNumberProps) => {
  const reduceMotion = useReducedMotion()
  const [lastValue, setLastValue] = useState(value)
  const [direction, setDirection] = useState<Direction>(1)

  if (value !== lastValue) {
    setDirection(value > lastValue ? 1 : -1)
    setLastValue(value)
  }

  const digits = String(value).split('')
  const placeEntering = reduceMotion ? undefined : placeEnter
  const placeExiting = reduceMotion ? undefined : placeExit

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? String(value)}
      accessibilityLiveRegion="polite"
    >
      {digits.map((digit, index) => {
        const place = digits.length - 1 - index

        return (
          <Animated.View key={`place-${place}`} entering={placeEntering} exiting={placeExiting}>
            <RollingDigit digit={digit} direction={direction} lineHeight={lineHeight} style={style} />
          </Animated.View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: { overflow: 'hidden', justifyContent: 'center' },
  outgoing: { position: 'absolute', left: 0, right: 0 },
})

export default memo(RollingNumber)
