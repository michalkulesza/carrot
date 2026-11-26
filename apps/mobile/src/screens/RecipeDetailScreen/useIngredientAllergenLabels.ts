import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { matchesActiveAllergen, type IngredientEntry } from './helpers'
import { getAllergenName, getIngredientName } from './swapHelpers'

export const useIngredientAllergenLabels = (entry: IngredientEntry, name: string, needed: boolean) => {
  const { t } = useTranslation()
  const { allergenFlag } = entry

  return useMemo(() => {
    if (!needed) return null

    const allergenName = allergenFlag?.allergen ? getAllergenName(t, allergenFlag.allergen) : ''
    const substitute = allergenFlag?.substitute ?? null
    const substituteName = getIngredientName(substitute ?? '')

    return {
      allergenName,
      allergenLabel: substitute ? t('recipes.allergenSwap', { allergen: allergenName, substitute }) : allergenName,
      allergenTooltip: substitute
        ? `${t('recipes.suggestedSubstitute')} ${substitute}`
        : t('recipes.noSubstituteAvailable'),
      containsLabel: `${t('recipes.contains')}: ${allergenName}`,
      substituteName,
      originalName: getIngredientName(allergenFlag?.original_display ?? ''),
      swapChipLabel: t('recipes.swapChipLabel', { allergen: allergenName }),
      swapChipAccessibility: t('recipes.swapChipAccessibility', {
        allergen: allergenName,
        old: name,
        new: substituteName,
      }),
    }
  }, [needed, allergenFlag, name, t])
}

export type IngredientAllergenLabels = NonNullable<ReturnType<typeof useIngredientAllergenLabels>>

export const useLinkedAllergenText = (entry: IngredientEntry, activeAllergens: string[]) => {
  const { t } = useTranslation()
  const { linkedAllergens } = entry

  return useMemo(() => {
    if (!linkedAllergens?.length) return null

    const labels = linkedAllergens
      .filter((allergen) => matchesActiveAllergen(allergen, activeAllergens))
      .map((allergen) => getAllergenName(t, allergen))
    if (labels.length === 0) return null

    return `${t('recipes.fromLinkedRecipe')}: ${labels.join(', ')}`
  }, [linkedAllergens, activeAllergens, t])
}
