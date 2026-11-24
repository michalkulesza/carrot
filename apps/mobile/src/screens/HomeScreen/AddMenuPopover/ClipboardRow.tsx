import { memo } from 'react'
import { Pressable, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { AppText } from '../../../components/ui'
import { palette } from '../../../theme'
import { styles } from './styles'

interface ClipboardRowProps {
  onImport: () => void
}

const ClipboardRow = ({ onImport }: ClipboardRowProps) => {
  const { t } = useTranslation()
  const importLabel = t('addMenu.clipboardImport')

  return (
    <View style={styles.clipboardRow}>
      <View style={[styles.iconTile, styles.iconTileOnTint]}>
        <SymbolView name="link" size={18} weight="semibold" tintColor={palette.actionText} />
      </View>
      <View style={styles.clipboardText}>
        <AppText variant="tileMeta" tone="actionText" style={styles.kicker}>
          {t('addMenu.clipboardKicker')}
        </AppText>
        <AppText variant="rowTitle" numberOfLines={1}>
          {t('addMenu.clipboardSubtitle')}
        </AppText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={importLabel} onPress={onImport} style={styles.importButton}>
        <AppText variant="rowTitle" tone="onAction">
          {importLabel}
        </AppText>
      </Pressable>
    </View>
  )
}

export default memo(ClipboardRow)
