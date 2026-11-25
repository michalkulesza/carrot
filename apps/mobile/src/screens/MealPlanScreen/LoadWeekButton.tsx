import { memo, useCallback } from 'react'
import { Pressable, Text } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { palette } from '../../theme'
import { lightHaptic } from '../../components/ui/haptics'
import { styles } from './styles'

interface LoadWeekButtonProps {
  label: string
  direction: 'up' | 'down'
  onPress: () => void
}

const LoadWeekButton = ({ label, direction, onPress }: LoadWeekButtonProps) => {
  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  return (
    <Pressable style={styles.loadWeekButton} onPress={handlePress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.loadWeekLabel}>{label}</Text>
      <SymbolView
        name={direction === 'up' ? 'chevron.up' : 'chevron.down'}
        size={14}
        weight="semibold"
        tintColor={palette.textSecondary}
      />
    </Pressable>
  )
}

export default memo(LoadWeekButton)
