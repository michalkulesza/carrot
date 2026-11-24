import { memo, useCallback, useMemo } from 'react'
import { LayoutChangeEvent, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated'
import { styles } from './styles'

interface TabPagerProps {
  progress: SharedValue<number>
  gesture: ReturnType<typeof Gesture.Pan>
  width: number
  onWidthChange: (width: number) => void
  steps: React.ReactNode
  ingredients: React.ReactNode
}

const TabPager = ({ progress, gesture, width, onWidthChange, steps, ingredients }: TabPagerProps) => {
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onWidthChange(event.nativeEvent.layout.width),
    [onWidthChange],
  )

  const rowStyle = useAnimatedStyle(() => ({
    width: width * 2,
    transform: [{ translateX: -progress.value * width }],
  }))
  const rowStyles = useMemo(() => [styles.pagerRow, rowStyle], [rowStyle])
  const pageStyle = useMemo(() => ({ width }), [width])

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.pager} onLayout={handleLayout}>
        {width > 0 ? (
          <Animated.View style={rowStyles}>
            <View style={pageStyle}>{steps}</View>
            <View style={pageStyle}>{ingredients}</View>
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  )
}

export default memo(TabPager)
