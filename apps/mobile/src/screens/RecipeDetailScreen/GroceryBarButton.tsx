import { memo, useCallback } from 'react'
import { Pressable, Text } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { lightHaptic } from '../../components/ui/haptics'
import { palette, usePressScale } from '../../theme'
import { styles } from './styles'

type GroceryBarTone = 'surface' | 'action'
type GroceryBarVariant = GroceryBarTone | 'disabled'

interface GroceryBarButtonProps {
  label: string
  tone: GroceryBarTone
  onPress: () => void
  icon?: SFSymbol
  disabled?: boolean
  haptic?: boolean
}

const ICON_SIZE = 17

const VARIANT_APPEARANCE = {
  surface: { container: styles.groceryBarSurface, foreground: palette.ink },
  action: { container: styles.groceryBarAction, foreground: palette.onAction },
  disabled: { container: styles.groceryBarDisabled, foreground: palette.textSecondary },
}

const GroceryBarButton = ({ label, tone, onPress, icon, disabled, haptic }: GroceryBarButtonProps) => {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()

  const variant: GroceryBarVariant = disabled ? 'disabled' : tone
  const { container, foreground } = VARIANT_APPEARANCE[variant]
  const containerStyle = [styles.groceryBarButton, container, animatedStyle]
  const labelStyle = [styles.groceryBarLabel, { color: foreground }]
  const wrapperStyle = tone === 'action' ? styles.groceryBarConfirm : styles.groceryBarCancel

  const handlePress = useCallback(() => {
    if (haptic) lightHaptic()
    onPress()
  }, [haptic, onPress])

  return (
    <Pressable
      style={wrapperStyle}
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <Animated.View style={containerStyle}>
        {icon ? <SymbolView name={icon} size={ICON_SIZE} tintColor={foreground} /> : null}
        <Text style={labelStyle} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

export default memo(GroceryBarButton)
