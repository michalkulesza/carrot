import { memo } from 'react'
import type { TextLayoutLine, ViewStyle } from 'react-native'
import Animated, { type AnimatedStyle } from 'react-native-reanimated'
import { SWAP_MARK_HEIGHT, SWAP_STRIKE_HEIGHT } from './ingredientRowLayout'

const MARK_BOTTOM_INSET = 1
const MARK_OVERHANG = 2
const STRIKE_POSITION = 0.52

interface SwapLineDecorationsProps {
  lines: TextLayoutLine[]
  variant: 'strike' | 'mark'
  style: ViewStyle
  animatedStyle: AnimatedStyle<ViewStyle>
}

const getLineFrame = (line: TextLayoutLine, variant: SwapLineDecorationsProps['variant']): ViewStyle => {
  if (variant === 'strike') {
    return { left: line.x, width: line.width, top: line.y + line.height * STRIKE_POSITION - SWAP_STRIKE_HEIGHT / 2 }
  }

  return {
    left: line.x - MARK_OVERHANG,
    width: line.width + MARK_OVERHANG * 2,
    top: line.y + line.height - MARK_BOTTOM_INSET - SWAP_MARK_HEIGHT,
  }
}

const SwapLineDecorations = ({ lines, variant, style, animatedStyle }: SwapLineDecorationsProps) => (
  <>
    {lines.map((line, index) => (
      <Animated.View key={index} pointerEvents="none" style={[style, getLineFrame(line, variant), animatedStyle]} />
    ))}
  </>
)

export default memo(SwapLineDecorations)
