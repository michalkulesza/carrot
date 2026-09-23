import { useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import type { AllergenFlag } from '@carrot/shared/types'
import {
  displayIngredientWithLocalizedUnit,
  getIngredientQuantityCount,
} from '@carrot/shared/utils/ingredientUtils'
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
  linkedRecipeUrl,
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
  linkedRecipeUrl?: string | null
}) => {
  const { t } = useTranslation()
  const [isAllergenTooltipOpen, setIsAllergenTooltipOpen] = useState(false)
  const displayValue = displayIngredientWithLocalizedUnit(ingredient, (unit, qty) =>
    t(`units.${unit}`, {
      count: ['cl', 'piece', 'sprig', 'leaf', 'sheet'].includes(unit) && qty ? getIngredientQuantityCount(qty) : 1,
      defaultValue: unit,
    }),
  )
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
      {linkedRecipeUrl && (
        <Pressable onPress={() => void Linking.openURL(linkedRecipeUrl)} accessibilityRole="link" accessibilityLabel={t('recipes.openLinkedRecipe')}>
          <Text style={styles.linkedRecipeText}>{t('recipes.openLinkedRecipe')}</Text>
        </Pressable>
      )}
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
