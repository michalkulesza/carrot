import { memo, useMemo } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import type { StrikeLayout, StrikeSegment } from './strikeHelpers'
import { styles } from './styles'

interface StrikeLineProps {
  segment: StrikeSegment
  progress: SharedValue<number>
}

interface StrikeLinesProps {
  layout: StrikeLayout
  progress: SharedValue<number>
}

const StrikeLine = ({ segment, progress }: StrikeLineProps) => {
  const { x, y, width, start, end } = segment

  const animatedStyle = useAnimatedStyle(() => {
    const span = end - start
    const reveal = span > 0 ? Math.min(1, Math.max(0, (progress.value - start) / span)) : 1
    return { transform: [{ translateX: (-width * (1 - reveal)) / 2 }, { scaleX: reveal }] }
  }, [progress, start, end, width])

  const lineStyle = useMemo(() => [styles.strikeLine, { left: x, top: y, width }, animatedStyle], [x, y, width, animatedStyle])

  return <Animated.View style={lineStyle} />
}

const StrikeLines = ({ layout, progress }: StrikeLinesProps) => (
  <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.strikeLayer}>
    {layout.segments.map((segment, index) => (
      <StrikeLine key={index} segment={segment} progress={progress} />
    ))}
  </View>
)

export default memo(StrikeLines)
