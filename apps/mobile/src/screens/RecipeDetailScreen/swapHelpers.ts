import type { TFunction } from 'i18next'
import { allergenShortLabel, normalizeAllergenKey } from '@carrot/shared/utils/allergenKeys'
import { scaleIngredientQuantity } from '@carrot/shared/utils/ingredientScaling'
import { matchesActiveAllergen, splitIngredient, type IngredientEntry } from './helpers'

export interface SwapItem {
  key: string
  componentIndex: number
  ingredientIndex: number
  groupName: string | null
  oldIngredient: string
  newIngredient: string
}

export interface SwapPlan {
  allergen: string
  target: SwapItem
  others: SwapItem[]
}

const keepUnit = (unit: string) => unit

export const getIngredientName = (ingredient: string) => splitIngredient(ingredient, keepUnit).name

export const getAllergenName = (t: TFunction, allergen: string) => allergenShortLabel(t, 'allergens', allergen)

export const isSwappableEntry = (entry: IngredientEntry, activeAllergens: string[]) => {
  const flag = entry.allergenFlag

  return (
    !!flag?.substitute &&
    !flag.substitute_applied &&
    matchesActiveAllergen(flag.allergen, activeAllergens)
  )
}

export const isAppliedEntry = (entry: IngredientEntry) =>
  !!entry.allergenFlag?.substitute_applied && !!entry.allergenFlag.original_display

const toSwapItem = (entry: IngredientEntry, servingScale: number): SwapItem => ({
  key: entry.key,
  componentIndex: entry.componentIndex,
  ingredientIndex: entry.ingredientIndex,
  groupName: entry.groupName,
  oldIngredient: entry.ingredient,
  newIngredient: scaleIngredientQuantity(entry.allergenFlag?.substitute ?? '', servingScale),
})

export const buildSwapPlan = (
  target: IngredientEntry,
  entries: IngredientEntry[],
  activeAllergens: string[],
  servingScale: number,
): SwapPlan => {
  const allergen = target.allergenFlag?.allergen ?? ''
  const allergenKey = normalizeAllergenKey(allergen)
  const baseName = getIngredientName(target.ingredient).toLowerCase()

  const others = entries.filter(
    (entry) =>
      entry.key !== target.key &&
      isSwappableEntry(entry, activeAllergens) &&
      normalizeAllergenKey(entry.allergenFlag?.allergen ?? '') === allergenKey &&
      getIngredientName(entry.ingredient).toLowerCase() === baseName,
  )

  return {
    allergen,
    target: toSwapItem(target, servingScale),
    others: others.map((entry) => toSwapItem(entry, servingScale)),
  }
}

export const getUniqueGroupNames = (items: SwapItem[], fallbackName: string) => [
  ...new Set(items.map((item) => item.groupName ?? fallbackName)),
]
