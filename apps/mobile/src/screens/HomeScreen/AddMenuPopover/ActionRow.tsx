import { memo, useCallback } from 'react'
import { Pressable, View } from 'react-native'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { AppText } from '../../../components/ui'
import { palette } from '../../../theme'
import { styles } from './styles'

interface ActionRowProps {
  icon: SFSymbol
  title: string
  subtitle?: string
  onPress: () => void
}

const ActionRow = ({ icon, title, subtitle, onPress }: ActionRowProps) => {
  const getRowStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.row, pressed && styles.rowPressed],
    [],
  )

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={getRowStyle}>
      <View style={styles.iconTile}>
        <SymbolView name={icon} size={18} weight="semibold" tintColor={palette.actionText} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="rowTitle">{title}</AppText>
        {subtitle ? (
          <AppText variant="tileMeta" tone="textTertiary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  )
}

export default memo(ActionRow)
