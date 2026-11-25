import { memo, useMemo } from 'react'
import { Pressable, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { AppText } from '../../components/ui'
import { palette } from '../../theme'
import { styles } from './styles'

const HEADER_ICON_SIZE = 14
const LEGEND_ICON_SIZE = 10
const CLOSE_ICON_SIZE = 12
const CARET_SIZE = 12
const CLOSE_HIT_SLOP = 6

interface AiEstimatePopoverProps {
  caretCenterX: number
  onDismiss: () => void
}

const AiEstimatePopover = ({ caretCenterX, onDismiss }: AiEstimatePopoverProps) => {
  const { t } = useTranslation()
  const caretStyle = useMemo(() => [styles.aiCaret, { left: caretCenterX - CARET_SIZE / 2 }], [caretCenterX])

  return (
    <>
      <Pressable style={styles.aiBackdrop} onPress={onDismiss} accessible={false} />
      <View style={styles.aiPopover} accessibilityViewIsModal accessibilityLabel={t('recipes.aiEstimateTitle')}>
        <View style={caretStyle} />
        <View style={styles.aiHeader}>
          <View style={styles.aiIconTile}>
            <SymbolView name="sparkle" size={HEADER_ICON_SIZE} tintColor={palette.actionText} />
          </View>
          <AppText style={styles.aiTitle}>{t('recipes.aiEstimateTitle')}</AppText>
          <Pressable
            style={styles.aiClose}
            onPress={onDismiss}
            hitSlop={CLOSE_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <SymbolView name="xmark" size={CLOSE_ICON_SIZE} weight="bold" tintColor={palette.textSecondary} />
          </Pressable>
        </View>
        <AppText style={styles.aiBody}>{t('recipes.aiEstimateBody')}</AppText>
        <View style={styles.aiLegend}>
          <SymbolView name="sparkle" size={LEGEND_ICON_SIZE} tintColor={palette.action} />
          <AppText style={styles.aiLegendText}>{t('recipes.aiEstimateLegend')}</AppText>
        </View>
      </View>
    </>
  )
}

export default memo(AiEstimatePopover)
