import { useCallback, useEffect, useState } from 'react'
import { LayoutChangeEvent, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native'
import Reanimated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

const PAUSE_MS = 1200
const SPEED_PX_PER_SEC = 28

type Props = {
  text: string
  style?: StyleProp<TextStyle>
  containerStyle?: StyleProp<ViewStyle>
}

// Single-line text that scrolls back and forth (like a K.I.T. scanner) when it
// doesn't fit its container, instead of wrapping or truncating with an ellipsis.
//
// The visible text is given an explicit numeric width (measured via an
// invisible absolutely-positioned copy) rather than left to "auto" — a plain
// auto-width Text nested under an overflow:hidden ancestor gets clamped to
// the available space by Yoga's layout pass, so it never actually reports a
// width wider than its container and the "does it overflow" check never
// trips. Absolute positioning alone isn't enough to escape that: the default
// alignItems: 'stretch' on the column parent still stretches an absolutely
// positioned Text to the container's cross-axis width, so alignSelf:
// 'flex-start' is required for the measurer to report its true intrinsic
// width instead of the clamped one.
const MarqueeText = ({ text, style, containerStyle }: Props) => {
  const [containerWidth, setContainerWidth] = useState(0)
  const [textWidth, setTextWidth] = useState(0)
  const translateX = useSharedValue(0)

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width)
  }, [])

  const onTextLayout = useCallback((e: LayoutChangeEvent) => {
    setTextWidth(e.nativeEvent.layout.width)
  }, [])

  useEffect(() => {
    const overflow = textWidth - containerWidth
    if (overflow > 0 && containerWidth > 0) {
      const duration = (overflow / SPEED_PX_PER_SEC) * 1000
      translateX.value = 0
      translateX.value = withRepeat(
        withSequence(
          withDelay(PAUSE_MS, withTiming(-overflow, { duration, easing: Easing.linear })),
          withDelay(PAUSE_MS, withTiming(0, { duration, easing: Easing.linear })),
        ),
        -1,
      )
    } else {
      cancelAnimation(translateX)
      translateX.value = 0
    }
    return () => cancelAnimation(translateX)
  }, [textWidth, containerWidth, translateX])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  return (
    <View style={[{ overflow: 'hidden' }, containerStyle]} onLayout={onContainerLayout}>
      <Text
        style={[style, { position: 'absolute', opacity: 0, alignSelf: 'flex-start' }]}
        onLayout={onTextLayout}
      >
        {text}
      </Text>
      <Reanimated.View style={[{ flexDirection: 'row' }, animatedStyle]}>
        <Text
          numberOfLines={1}
          style={[style, textWidth > 0 ? { width: textWidth } : null]}
        >
          {text}
        </Text>
      </Reanimated.View>
    </View>
  )
}

export default MarqueeText
