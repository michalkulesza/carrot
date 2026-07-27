import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import type { AllergenFlag } from '@carrot/shared/types'
import { displayIngredient } from '@carrot/shared/utils/ingredientUtils'
import { normalizeAllergenKey } from '@carrot/shared/utils/allergenKeys'
import { TooltipPopover } from '../../components/NutritionBoxGrid'
import { colors } from '../../theme/colors'
import { matchesActiveAllergen } from './helpers'
import { styles } from './styles'

const IngredientRow = ({
  ingredient,
  cupHint = '',
  addMode = false,
  isAdded = false,
  onAdd,
  allergenFlag,
  activeAllergens = [],
  fontSize = 17,
  lineHeight = 22,
}: {
  ingredient: string
  cupHint?: string
  addMode?: boolean
  isAdded?: boolean
  onAdd?: () => void
  allergenFlag?: AllergenFlag | null
  activeAllergens?: string[]
  fontSize?: number
  lineHeight?: number
}) => {
  const { t } = useTranslation()
  const [isAllergenTooltipOpen, setIsAllergenTooltipOpen] = useState(false)
  const displayValue = displayIngredient(ingredient)
  const hasMatchedAllergen = matchesActiveAllergen(
    allergenFlag?.allergen ?? null,
    activeAllergens,
  )
  const allergenTooltip = allergenFlag?.substitute
    ? `${t('recipes.suggestedSubstitute')} ${allergenFlag.substitute}`
    : t('recipes.noSubstituteAvailable')
  const allergenLabel = allergenFlag?.allergen
    ? t(`allergens.${normalizeAllergenKey(allergenFlag.allergen)}`, {
        defaultValue: allergenFlag.allergen,
      })
    : ''
  return (
    <View style={styles.ingredientRow}>
      <Text style={styles.bullet}>{'•'}</Text>
      <Text style={[styles.ingredientText, { fontSize, lineHeight }]}>
        {displayValue}
        {cupHint}
      </Text>
      {addMode && (
        <Pressable
          onPress={isAdded ? undefined : onAdd}
          hitSlop={8}
          style={styles.addIngredientBtn}
          accessibilityLabel={isAdded ? t('shoppingList.addedToList') : t('shoppingList.addToList')}
        >
          <Feather name={isAdded ? 'check' : 'plus'} size={18} color={isAdded ? colors.green : colors.blue} />
        </Pressable>
      )}
      {hasMatchedAllergen && (
        <View style={styles.allergenWarningWrapper}>
          <Pressable
            onPress={() => setIsAllergenTooltipOpen((open) => !open)}
            hitSlop={8}
            style={styles.allergenWarningButton}
            accessibilityRole="button"
            accessibilityLabel={`${t('recipes.contains')}: ${allergenLabel}`}
            accessibilityState={{ expanded: isAllergenTooltipOpen }}
          >
            <Feather name="alert-triangle" size={18} color={colors.orange} />
          </Pressable>
          {isAllergenTooltipOpen && (
            <TooltipPopover
              text={allergenTooltip}
              header={allergenLabel}
              alignRight
              onDismiss={() => setIsAllergenTooltipOpen(false)}
            />
          )}
        </View>
      )}
    </View>
  )
}

export default IngredientRow
