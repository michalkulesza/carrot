import { useCallback, useState } from 'react'
import { LayoutChangeEvent, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native'
import Reanimated from 'react-native-reanimated'
import { useMarqueeAnimation } from './useMarqueeAnimation'

type Props = {
  text: string
  style?: StyleProp<TextStyle>
  containerStyle?: StyleProp<ViewStyle>
  turn: number | null
  onOverflowChange: (overflows: boolean) => void
  onDone: () => void
}

// Single-line text that scrolls back and forth (like a K.I.T. scanner) for
// one pause-scroll-pause-scroll-back cycle whenever `turn` changes, instead
// of wrapping or truncating with an ellipsis. Meant to be driven by
// MarqueeSyncProvider (via turn/onOverflowChange/onDone) so it takes turns
// with sibling marquees instead of scrolling simultaneously.
//
// The visible text is given an explicit numeric width (measured via an
// invisible copy) rather than left to "auto". A plain `maxWidth` clamp on
// the measuring Text itself is not enough: Yoga still derives the "available
// space" it measures an auto-width node against from the real (narrow)
// ancestor, and a local maxWidth only ever shrinks that bound further, never
// widens it. To get the text's true, uncapped single-line width, the
// measurer needs an ancestor whose width is *explicit* (not auto) and large
// — explicit dimensions are resolved directly, without consulting outer
// constraints — so the inner Text's own available-space bound comes from
// that generous explicit width instead of the real container.
const MEASURE_MAX_WIDTH = 2000
const MarqueeText = ({ text, style, containerStyle, turn, onOverflowChange, onDone }: Props) => {
  const [containerWidth, setContainerWidth] = useState(0)
  const [textWidth, setTextWidth] = useState(0)

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width)
  }, [])

  const onTextLayout = useCallback((e: LayoutChangeEvent) => {
    setTextWidth(e.nativeEvent.layout.width)
  }, [])

  const animatedStyle = useMarqueeAnimation(textWidth, containerWidth, turn, onOverflowChange, onDone)

  return (
    <View style={[{ overflow: 'hidden' }, containerStyle]} onLayout={onContainerLayout}>
      <View
        style={{
          position: 'absolute',
          opacity: 0,
          width: MEASURE_MAX_WIDTH,
          height: 0,
          overflow: 'hidden',
        }}
      >
        <Text
          numberOfLines={1}
          style={[style, { alignSelf: 'flex-start' }]}
          onLayout={onTextLayout}
        >
          {text}
        </Text>
      </View>
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
