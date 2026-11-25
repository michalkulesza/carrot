import { memo, useCallback, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { lightHaptic } from '../../components/ui/haptics'
import { palette } from '../../theme'
import { styles } from './styles'

interface EditStepRowProps {
  ci: number
  si: number
  step: string
  onPress: (ci: number, si: number) => void
}

const PENCIL_SIZE = 16
const CIRCLE_STYLE = [styles.stepCircle, styles.editStepCircle]
const BODY_STYLE = [styles.editStepBody, styles.stepBodySpaced]

const EditStepRow = ({ ci, si, step, onPress }: EditStepRowProps) => {
  const { t } = useTranslation()

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress(ci, si)
  }, [onPress, ci, si])

  const hasText = step.length > 0
  const textStyle = useMemo(
    () => [styles.editStepText, !hasText && styles.editIngredientPlaceholder],
    [hasText],
  )

  return (
    <Pressable
      onPress={handlePress}
      style={styles.stepRow}
      accessibilityRole="button"
      accessibilityLabel={`${t('recipes.stepLabel', { n: si + 1 })}. ${step}`}
      accessibilityHint={t('recipes.editStep')}
    >
      <View style={styles.stepTimeline}>
        <View style={CIRCLE_STYLE}>
          <Text style={styles.stepNumber}>{si + 1}</Text>
        </View>
        <View style={styles.stepLine} />
      </View>
      <View style={BODY_STYLE}>
        <Text style={textStyle}>{hasText ? step : t('recipes.stepPlaceholder')}</Text>
        <View style={styles.editStepPencil}>
          <SymbolView name="pencil" size={PENCIL_SIZE} weight="semibold" tintColor={palette.textTertiary} />
        </View>
      </View>
    </Pressable>
  )
}

export default memo(EditStepRow)
