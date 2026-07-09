import { ReactNode, useCallback, useEffect, useState } from 'react'
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native'
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
  children: ReactNode
  containerStyle?: StyleProp<ViewStyle>
  gap?: number
}

// Single-line row of arbitrary children (e.g. tag pills) that scrolls back
// and forth when it doesn't fit its container, instead of wrapping.
// Mirrors MarqueeText's approach: an invisible absolutely-positioned copy of
// the row reports the true intrinsic width (Yoga would otherwise clamp an
// in-flow row to the overflow:hidden container's width), which is then used
// to size and animate the visible copy.
const MarqueeRow = ({ children, containerStyle, gap = 0 }: Props) => {
  const [containerWidth, setContainerWidth] = useState(0)
  const [contentWidth, setContentWidth] = useState(0)
  const translateX = useSharedValue(0)

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width)
  }, [])

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    setContentWidth(e.nativeEvent.layout.width)
  }, [])

  useEffect(() => {
    const overflow = contentWidth - containerWidth
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
  }, [contentWidth, containerWidth, translateX])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  return (
    <View style={[{ overflow: 'hidden' }, containerStyle]} onLayout={onContainerLayout}>
      <View
        style={{ position: 'absolute', opacity: 0, flexDirection: 'row', gap }}
        onLayout={onContentLayout}
      >
        {children}
      </View>
      <Reanimated.View
        style={[
          { flexDirection: 'row', gap },
          animatedStyle,
          contentWidth > 0 ? { width: contentWidth } : null,
        ]}
      >
        {children}
      </Reanimated.View>
    </View>
  )
}

export default MarqueeRow
