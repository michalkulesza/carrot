import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { palette } from '../../theme'
import { styles } from './styles'

interface CreateRowProps {
  label: string
  query?: string
  disabled?: boolean
  accessibilityLabel: string
  onPress: () => void
}

const CreateRow = ({ label, query, disabled, accessibilityLabel, onPress }: CreateRowProps) => (
  <Pressable
    style={styles.createRow}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
  >
    <View style={styles.createPlus}>
      <SymbolView name="plus" size={14} weight="bold" tintColor={palette.onAction} />
    </View>
    <Text style={styles.createText} numberOfLines={1}>
      {label}
      {query ? <Text style={styles.createQuery}>{` “${query}”`}</Text> : null}
    </Text>
  </Pressable>
)

export default memo(CreateRow)
