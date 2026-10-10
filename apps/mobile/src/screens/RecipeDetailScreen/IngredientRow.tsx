import { useCallback, useState } from 'react'
import { ActionSheetIOS, Alert, Linking, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import type { AllergenFlag, IngredientLinkKind, LinkedRecipeImportResult } from '@carrot/shared/types'
import { useLinkedRecipeImport } from '@carrot/shared/hooks/useLinkedRecipeImport'
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
  recipeId,
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
  linkedRecipeId,
  linkedRecipeKind,
  linkedAllergens,
}: {
  recipeId: string
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
  linkedRecipeId?: string | null
  linkedRecipeKind?: IngredientLinkKind | null
  linkedAllergens?: string[] | null
}) => {
  const { t } = useTranslation()
  const router = useRouter()
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
  const linkedAllergenLabels = (linkedAllergens ?? [])
    .filter((allergen) => matchesActiveAllergen(allergen, activeAllergens))
    .map((allergen) =>
      t(`allergens.${normalizeAllergenKey(allergen)}`, { defaultValue: allergen }),
    )
  const linkedRecipeImport = useLinkedRecipeImport(recipeId)
  const [isLinkedImportQueued, setIsLinkedImportQueued] = useState(false)
  const isLinkedImportBusy = linkedRecipeImport.isPending || isLinkedImportQueued

  const handleLinkedImportSuccess = useCallback(
    (result: LinkedRecipeImportResult) => {
      if (result.recipe_id) {
        router.navigate(`/recipe/${result.recipe_id}`)
        return
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setIsLinkedImportQueued(true)
    },
    [router],
  )

  const handleLinkedImportError = useCallback(() => {
    Alert.alert(t('recipes.linkedImportFailed'))
  }, [t])

  const handleImportLinkedRecipe = useCallback(() => {
    if (!linkedRecipeUrl || isLinkedImportBusy) return
    linkedRecipeImport.mutate(linkedRecipeUrl, {
      onSuccess: handleLinkedImportSuccess,
      onError: handleLinkedImportError,
    })
  }, [linkedRecipeUrl, isLinkedImportBusy, linkedRecipeImport, handleLinkedImportSuccess, handleLinkedImportError])

  const handleLinkedActionSheetSelect = useCallback(
    (selectedIndex: number) => {
      if (selectedIndex === 0) handleImportLinkedRecipe()
      else if (selectedIndex === 1 && linkedRecipeUrl) void Linking.openURL(linkedRecipeUrl)
    },
    [handleImportLinkedRecipe, linkedRecipeUrl],
  )

  const isExternalLink = linkedRecipeKind === 'external'

  const handleOpenLinkedRecipe = () => {
    if (isExternalLink) {
      if (linkedRecipeUrl) void Linking.openURL(linkedRecipeUrl)
      return
    }
    if (linkedRecipeId) {
      router.navigate(`/recipe/${linkedRecipeId}`)
      return
    }
    if (!linkedRecipeUrl || isLinkedImportBusy) return
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [t('recipes.importLinkedRecipe'), t('recipes.openLinkedWebsite'), t('common.cancel')],
        cancelButtonIndex: 2,
      },
      handleLinkedActionSheetSelect,
    )
  }
  const linkedRecipeLabel = isExternalLink
    ? t('recipes.openLink')
    : isLinkedImportBusy
      ? t('recipes.linkedImportQueued')
      : t('recipes.openLinkedRecipe')
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
        <Pressable
          onPress={handleOpenLinkedRecipe}
          disabled={!isExternalLink && isLinkedImportBusy}
          accessibilityRole="link"
          accessibilityLabel={linkedRecipeLabel}
        >
          <Text style={styles.linkedRecipeText}>{linkedRecipeLabel}</Text>
        </Pressable>
      )}
      {linkedAllergenLabels.length > 0 && (
        <Text
          style={styles.linkedAllergenText}
          accessibilityLabel={`${t('recipes.fromLinkedRecipe')}: ${linkedAllergenLabels.join(', ')}`}
        >
          {`⚠ ${linkedAllergenLabels.join(', ')}`}
        </Text>
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
