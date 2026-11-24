import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { palette, radius, typography } from '../../theme'
import { selectionHaptic } from './haptics'

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
  count?: number
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  progress?: SharedValue<number>
}

const TRACK_PADDING = 3
const SEGMENT_HEIGHT = 38
const SLIDE_MS = 200
const COUNT_OPACITY = 0.55

const SegmentedControl = <T extends string>({ options, value, onChange, progress }: SegmentedControlProps<T>) => {
  const reduceMotion = useReducedMotion()
  const [trackWidth, setTrackWidth] = useState(0)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const ownProgress = useSharedValue(selectedIndex)
  const activeProgress = progress ?? ownProgress
  const segmentWidth = Math.max(0, (trackWidth - TRACK_PADDING * 2) / options.length)

  useEffect(() => {
    if (progress) return

    ownProgress.value = reduceMotion ? selectedIndex : withTiming(selectedIndex, { duration: SLIDE_MS })
  }, [progress, ownProgress, selectedIndex, reduceMotion])

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width)
  }, [])

  const indicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: activeProgress.value * segmentWidth }],
  }))

  const indicatorStyles = useMemo(() => [styles.indicator, indicatorStyle], [indicatorStyle])

  return (
    <View style={styles.track} onLayout={handleLayout} accessibilityRole="tablist">
      <Animated.View style={indicatorStyles} pointerEvents="none" />
      {options.map((option) => (
        <Segment key={option.value} option={option} selected={option.value === value} onSelect={onChange} />
      ))}
    </View>
  )
}

interface SegmentProps<T extends string> {
  option: SegmentedControlOption<T>
  selected: boolean
  onSelect: (value: T) => void
}

const Segment = <T extends string>({ option, selected, onSelect }: SegmentProps<T>) => {
  const handlePress = useCallback(() => {
    if (selected) return

    selectionHaptic()
    onSelect(option.value)
  }, [selected, onSelect, option.value])

  const accessibilityState = useMemo(() => ({ selected }), [selected])
  const color = selected ? palette.ink : palette.textSecondary

  return (
    <Pressable
      style={styles.segment}
      onPress={handlePress}
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
    >
      <Text style={[typography.button, { color }]} numberOfLines={1}>
        {option.label}
      </Text>
      {option.count === undefined ? null : (
        <Text style={[typography.button, styles.count, { color }]}>{option.count}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: TRACK_PADDING,
    borderRadius: radius.control,
    backgroundColor: palette.control,
  },
  indicator: {
    position: 'absolute',
    top: TRACK_PADDING,
    left: TRACK_PADDING,
    height: SEGMENT_HEIGHT,
    borderRadius: 11,
    backgroundColor: palette.popoverSurface,
    shadowColor: palette.shadowSoft,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
  },
  segment: {
    flex: 1,
    height: SEGMENT_HEIGHT,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  count: { fontWeight: '500', opacity: COUNT_OPACITY },
})

export default memo(SegmentedControl) as typeof SegmentedControl
