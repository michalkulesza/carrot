import type { ComponentProps } from 'react'
import { ActivityIndicator, Pressable, View, type PressableStateCallbackType } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { colors } from '../../theme/colors'
import { styles } from './styles'

interface HeaderIconButtonProps {
  icon: ComponentProps<typeof Feather>['name']
  accessibilityLabel: string
  onPress?: () => void
  color?: string
  size?: number
  pending?: boolean
}

const getButtonStyle = ({ pressed }: PressableStateCallbackType) => [styles.headerBtn, pressed && styles.headerBtnPressed]

const HeaderIconButton = ({
  icon,
  accessibilityLabel,
  onPress,
  color = colors.secondaryLabel,
  size = 20,
  pending = false,
}: HeaderIconButtonProps) => {
  const accessibilityState = { busy: pending, disabled: pending }

  return (
    <Pressable
      onPress={onPress}
      disabled={pending}
      style={getButtonStyle}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
    >
      <View style={pending && styles.headerBtnContentHidden}>
        <Feather name={icon} size={size} color={color} />
      </View>
      {pending && (
        <View style={styles.headerBtnSpinner}>
          <ActivityIndicator size="small" />
        </View>
      )}
    </Pressable>
  )
}

export default HeaderIconButton
