import { memo } from 'react'
import { Pressable, Text } from 'react-native'
import { palette } from '../../theme'
import { styles } from './styles'

interface HeaderTextButtonProps {
  label: string
  onPress: () => void
  disabled?: boolean
  accent?: boolean
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }
const ACCENT_LABEL_STYLE = [styles.headerTextButtonLabel, { color: palette.action, fontWeight: '600' as const }]

const HeaderTextButton = ({ label, onPress, disabled = false, accent = false }: HeaderTextButtonProps) => {
  const accessibilityState = { disabled }
  const containerStyle = disabled ? [styles.headerTextButton, styles.headerTextButtonDisabled] : styles.headerTextButton

  return (
    <Pressable
      style={containerStyle}
      onPress={onPress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
    >
      <Text style={accent ? ACCENT_LABEL_STYLE : styles.headerTextButtonLabel}>{label}</Text>
    </Pressable>
  )
}

export default memo(HeaderTextButton)
