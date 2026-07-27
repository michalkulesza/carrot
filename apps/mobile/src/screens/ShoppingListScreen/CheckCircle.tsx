import { useEffect } from 'react'
import { Pressable } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import CheckboxIcon from '../../components/CheckboxIcon'
import { styles } from './styles'

const CheckCircle = ({
  checked,
  onPress,
  accessibilityLabel,
}: {
  checked: boolean
  onPress: () => void
  accessibilityLabel?: string
}) => {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(checked ? 1 : 0)

  useEffect(() => {
    progress.value = reduceMotion ? Number(checked) : withTiming(Number(checked), { duration: 180 })
  }, [checked, progress, reduceMotion])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.9, 1.12]) }],
  }))

  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
      style={styles.circleBtn}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={animatedStyle}>
        <CheckboxIcon checked={checked} />
      </Animated.View>
    </Pressable>
  )
}

export default CheckCircle
