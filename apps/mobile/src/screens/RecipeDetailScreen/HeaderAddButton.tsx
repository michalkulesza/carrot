import { memo, useCallback, useEffect } from 'react'
import { Pressable, Text } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { lightHaptic } from '../../components/ui/haptics'
import { palette, settleEasing } from '../../theme'
import { styles } from './styles'

const HIDDEN_SCALE = 0.9
const OPACITY_MS = 200
const SCALE_MS = 250
const HIT_SLOP = { top: 6, bottom: 6, left: 8, right: 8 }

interface HeaderAddButtonProps {
  label: string
  accessibilityLabel: string
  onPress: () => void
  visible?: boolean
}

const HeaderAddButton = ({ label, accessibilityLabel, onPress, visible = true }: HeaderAddButtonProps) => {
  const reduceMotion = useReducedMotion()
  const shown = useSharedValue(visible ? 1 : 0)
  const scale = useSharedValue(visible ? 1 : HIDDEN_SCALE)

  useEffect(() => {
    const opacityTarget = visible ? 1 : 0
    const scaleTarget = visible ? 1 : HIDDEN_SCALE

    if (reduceMotion) {
      shown.value = opacityTarget
      scale.value = scaleTarget
      return
    }

    shown.value = withTiming(opacityTarget, { duration: OPACITY_MS, easing: Easing.out(Easing.cubic) })
    scale.value = withTiming(scaleTarget, { duration: SCALE_MS, easing: settleEasing })
  }, [visible, reduceMotion, shown, scale])

  const animatedStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: scale.value }] }))

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  return (
    <Animated.View style={animatedStyle} pointerEvents={visible ? 'auto' : 'none'}>
      <Pressable
        style={styles.headerAddButton}
        onPress={handlePress}
        hitSlop={HIT_SLOP}
        disabled={!visible}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityElementsHidden={!visible}
      >
        <SymbolView name="plus" size={13} weight="semibold" tintColor={palette.actionText} />
        <Text style={styles.headerAddLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  )
}

export default memo(HeaderAddButton)
