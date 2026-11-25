import { memo, useCallback, type ReactNode } from 'react'
import { Pressable, Text } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { palette } from '../../theme'
import { lightHaptic } from '../ui/haptics'
import { styles } from './styles'

interface SelectionChipProps {
  label: string
  removeLabel: string
  onRemove: () => void
  leading?: ReactNode
}

const SelectionChip = ({ label, removeLabel, onRemove, leading }: SelectionChipProps) => {
  const handlePress = useCallback(() => {
    lightHaptic()
    onRemove()
  }, [onRemove])

  const chipStyle = [styles.chip, leading ? styles.chipWithLeading : styles.chipPlain]

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={6}
      style={chipStyle}
      accessibilityRole="button"
      accessibilityLabel={removeLabel}
    >
      {leading}
      <Text style={styles.chipLabel} numberOfLines={1}>
        {label}
      </Text>
      <SymbolView name="xmark" size={10} weight="bold" tintColor={palette.actionText} />
    </Pressable>
  )
}

export default memo(SelectionChip)
