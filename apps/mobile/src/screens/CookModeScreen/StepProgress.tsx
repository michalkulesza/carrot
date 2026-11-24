import { memo, useEffect, useMemo } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { styles } from './styles'

const FILL_MS = 220

const ProgressSegment = ({ filled }: { filled: boolean }) => {
  const reduceMotion = useReducedMotion()
  const fill = useSharedValue(filled ? 1 : 0)

  useEffect(() => {
    fill.value = reduceMotion ? Number(filled) : withTiming(Number(filled), { duration: FILL_MS })
  }, [filled, fill, reduceMotion])

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }))
  const fillStyles = useMemo(() => [styles.progressFill, fillStyle], [fillStyle])

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={fillStyles} />
    </View>
  )
}

const StepProgress = ({ total, index }: { total: number; index: number }) => {
  const segments = useMemo(() => Array.from({ length: total }, (_, position) => position), [total])

  return (
    <View style={styles.stepProgress}>
      {segments.map((position) => (
        <ProgressSegment key={position} filled={position <= index} />
      ))}
    </View>
  )
}

export default memo(StepProgress)
