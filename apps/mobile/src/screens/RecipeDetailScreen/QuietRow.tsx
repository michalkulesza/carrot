import { memo, useCallback } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { lightHaptic } from '../../components/ui/haptics'
import { palette } from '../../theme'
import { styles } from './styles'

interface QuietRowProps {
  symbol: SFSymbol
  title: string
  hint: string
  onPress: () => void
}

const QuietRow = ({ symbol, title, hint, onPress }: QuietRowProps) => {
  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  return (
    <Pressable
      style={styles.quietRow}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
    >
      <View style={styles.quietTile}>
        <SymbolView name={symbol} size={18} tintColor={palette.actionText} />
      </View>
      <View style={styles.quietText}>
        <Text style={styles.quietTitle}>{title}</Text>
        <Text style={styles.quietHint}>{hint}</Text>
      </View>
    </Pressable>
  )
}

export default memo(QuietRow)
