import { memo, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { palette } from '../../theme'
import { styles } from './styles'

const CHECK_SIZE = 12
const UNDO_HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 }

interface SwappedDetailsProps {
  oldName: string
  disabled: boolean
  onUndo: () => void
}

const SwappedDetails = ({ oldName, disabled, onUndo }: SwappedDetailsProps) => {
  const { t } = useTranslation()

  const pillLabel = t('recipes.swapPill', { name: oldName })
  const accessibilityState = useMemo(() => ({ disabled }), [disabled])
  const undoLabel = t('recipes.swapUndoAccessibility', { name: oldName })

  return (
    <View style={styles.swapStatusRow}>
      <View style={styles.swapPill} accessible accessibilityLabel={pillLabel}>
        <SymbolView name="checkmark" size={CHECK_SIZE} weight="bold" tintColor={palette.success} />
        <Text style={styles.swapPillText}>{pillLabel}</Text>
      </View>
      <Pressable
        style={styles.swapUndo}
        onPress={onUndo}
        disabled={disabled}
        hitSlop={UNDO_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={undoLabel}
        accessibilityState={accessibilityState}
      >
        <Text style={styles.swapUndoText}>{t('common.undo')}</Text>
      </Pressable>
    </View>
  )
}

export default memo(SwappedDetails)
