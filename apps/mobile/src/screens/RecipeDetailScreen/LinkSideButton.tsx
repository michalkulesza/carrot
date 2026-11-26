import { memo, useCallback, useMemo } from 'react'
import { Pressable, type ViewStyle } from 'react-native'
import Animated, { type AnimatedStyle } from 'react-native-reanimated'
import { usePressScale } from '../../theme'
import { lightHaptic } from '../../components/ui/haptics'
import LinkIcon from './LinkIcon'
import { styles } from './styles'

interface LinkSideButtonProps {
  isExternal: boolean
  disabled: boolean
  hidden: boolean
  accessibilityLabel: string
  animatedStyle: AnimatedStyle<ViewStyle>
  onPress: () => void
}

const LinkSideButton = ({
  isExternal,
  disabled,
  hidden,
  accessibilityLabel,
  animatedStyle,
  onPress,
}: LinkSideButtonProps) => {
  const press = usePressScale()
  const accessibilityState = useMemo(() => ({ disabled }), [disabled])

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  return (
    <Animated.View
      style={animatedStyle}
      pointerEvents={hidden ? 'none' : 'auto'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={disabled || hidden}
        style={styles.linkButton}
        accessibilityRole="link"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
      >
        <Animated.View style={press.animatedStyle}>
          <LinkIcon isExternal={isExternal} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

export default memo(LinkSideButton)
