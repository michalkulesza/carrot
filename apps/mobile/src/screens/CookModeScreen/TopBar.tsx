import { memo } from 'react'
import { Text, View } from 'react-native'
import { IconButton } from '../../components/ui'
import { styles } from './styles'

interface TopBarProps {
  stepLabel: string
  closeLabel: string
  textSizeLabel: string
  onClose: () => void
  onCycleTextSize: () => void
}

const TopBar = ({ stepLabel, closeLabel, textSizeLabel, onClose, onCycleTextSize }: TopBarProps) => (
  <View style={styles.topBar}>
    <IconButton icon="xmark" onPress={onClose} accessibilityLabel={closeLabel} />
    <Text style={styles.topBarLabel}>{stepLabel}</Text>
    <IconButton label="Aa" onPress={onCycleTextSize} accessibilityLabel={textSizeLabel} />
  </View>
)

export default memo(TopBar)
