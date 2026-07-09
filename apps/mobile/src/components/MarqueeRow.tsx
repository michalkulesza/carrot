import { ReactNode, useCallback, useState } from 'react'
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native'
import Reanimated from 'react-native-reanimated'
import { useMarqueeAnimation } from './useMarqueeAnimation'

type Props = {
  children: ReactNode
  containerStyle?: StyleProp<ViewStyle>
  gap?: number
  turn: number | null
  onOverflowChange: (overflows: boolean) => void
  onDone: () => void
}

// Single-line row of arbitrary children (e.g. tag pills) that scrolls back
// and forth for one pause-scroll-pause-scroll-back cycle whenever `turn`
// changes, instead of wrapping. Meant to be driven by MarqueeSyncProvider
// (via turn/onOverflowChange/onDone) so it takes turns with sibling
// marquees instead of scrolling simultaneously.
//
// Mirrors MarqueeText's measurement approach: an invisible absolutely-
// positioned copy of the row reports the true intrinsic width (Yoga would
// otherwise clamp an in-flow row to the overflow:hidden container's width),
// which is then used to size and animate the visible copy.
const MarqueeRow = ({ children, containerStyle, gap = 0, turn, onOverflowChange, onDone }: Props) => {
  const [containerWidth, setContainerWidth] = useState(0)
  const [contentWidth, setContentWidth] = useState(0)

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width)
  }, [])

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    setContentWidth(e.nativeEvent.layout.width)
  }, [])

  const animatedStyle = useMarqueeAnimation(contentWidth, containerWidth, turn, onOverflowChange, onDone)

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
