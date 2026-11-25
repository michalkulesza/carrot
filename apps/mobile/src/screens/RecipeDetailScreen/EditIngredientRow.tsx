import { memo, useCallback, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import type { StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import { lightHaptic } from '../../components/ui/haptics'
import { palette } from '../../theme'
import { formatEditIngredientQuantity } from './helpers'
import { styles } from './styles'

interface EditIngredientRowProps {
  ci: number
  ii: number
  ingredient: StructuredIngredient
  isLast: boolean
  onPress: (ci: number, ii: number) => void
}

const CHEVRON_SIZE = 13

const EditIngredientRow = ({ ci, ii, ingredient, isLast, onPress }: EditIngredientRowProps) => {
  const { t } = useTranslation()

  const quantity = useMemo(() => formatEditIngredientQuantity(ingredient, t), [ingredient, t])

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress(ci, ii)
  }, [onPress, ci, ii])

  const rowStyle = useMemo(() => [styles.ingredientRow, !isLast && styles.ingredientRowDivider], [isLast])
  const hasName = ingredient.name.length > 0
  const nameStyle = useMemo(
    () => [styles.ingredientName, !hasName && styles.editIngredientPlaceholder],
    [hasName],
  )
  const accessibilityLabel = [quantity, ingredient.name].filter(Boolean).join(' ') || t('recipes.editIngredient')

  return (
    <Pressable
      onPress={handlePress}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={t('recipes.editIngredient')}
    >
      <Text style={styles.ingredientQuantity} numberOfLines={3}>
        {quantity}
      </Text>
      <View style={styles.ingredientBody}>
        <Text style={nameStyle}>{hasName ? ingredient.name : t('recipes.ingredientPlaceholder')}</Text>
      </View>
      <View style={styles.editIngredientCol}>
        <SymbolView name="chevron.right" size={CHEVRON_SIZE} weight="semibold" tintColor={palette.textTertiary} />
      </View>
    </Pressable>
  )
}

export default memo(EditIngredientRow)
