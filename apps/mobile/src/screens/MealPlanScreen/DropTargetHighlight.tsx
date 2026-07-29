import { memo } from 'react'
import Animated, { type AnimatedStyle } from 'react-native-reanimated'
import type { ViewStyle } from 'react-native'
import { styles } from './styles'

interface DropTargetHighlightProps {
  style: AnimatedStyle<ViewStyle>
}

const DropTargetHighlight = ({ style }: DropTargetHighlightProps) => (
  <Animated.View style={[styles.dropTargetHighlight, style]} pointerEvents="none" />
)

export default memo(DropTargetHighlight)
