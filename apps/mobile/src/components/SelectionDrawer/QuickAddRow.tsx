import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { palette } from '../../theme'
import { lightHaptic } from '../ui/haptics'
import { styles } from './styles'

interface QuickAddRowProps {
  title: string
  meta: string
  accessibilityLabel: string
  onPress: () => void
}

const QuickAddRow = ({ title, meta, accessibilityLabel, onPress }: QuickAddRowProps) => {
  const handlePress = () => {
    lightHaptic()
    onPress()
  }

  const rowStyle = [styles.quickRow, styles.rowDivider]

  return (
    <Pressable style={rowStyle} onPress={handlePress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      <View style={styles.quickPlus}>
        <SymbolView name="plus" size={22} weight="semibold" tintColor={palette.actionText} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.quickTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
    </Pressable>
  )
}

export default memo(QuickAddRow)
