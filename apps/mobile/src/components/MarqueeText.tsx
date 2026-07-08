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
      <Reanimated.View style={[{ flexDirection: 'row', alignSelf: 'flex-start' }, animatedStyle]}>
        <Text numberOfLines={1} onLayout={onTextLayout} style={style}>
          {text}
        </Text>
      </Reanimated.View>
    </View>
  )
}

export default MarqueeText
