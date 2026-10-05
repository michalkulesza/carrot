import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { SaveComponent } from '@carrot/shared/types'
import { getIngredientQuantityCount } from '@carrot/shared/utils/ingredientUtils'
import {
  displayIngredientWithLocalizedUnit,
  getScaledIngredientValues,
  SHORT_UNITS,
  parseIngredient,
} from './helpers'

export interface UnifiedIngredient {
  key: string
  component: SaveComponent
  componentIndex: number
  ingredient: string
  ingredientIndex: number
}

export interface IngredientParts {
  amount: string
  name: string
}

export const useUnifiedIngredients = (
  components: SaveComponent[],
  unitSystem: string,
  servingScale: number
) => {
  const { t } = useTranslation()
  const items = useMemo<UnifiedIngredient[]>(
    () =>
      components.flatMap((component, componentIndex) =>
        getScaledIngredientValues(component, unitSystem, servingScale).map(
          (ingredient, ingredientIndex) => ({
            key: `${componentIndex}-${ingredientIndex}`,
            component,
            componentIndex,
            ingredient,
            ingredientIndex,
          })
        )
      ),
    [components, servingScale, unitSystem]
  )
  const translateUnit = (unit: string, qty: string) =>
    t(`units.${unit}`, {
      count:
        ['cl', 'piece', 'sprig', 'leaf', 'sheet'].includes(unit) && qty
          ? getIngredientQuantityCount(qty)
          : 1,
      defaultValue: unit,
    })
  const format = (ingredient: string) =>
    displayIngredientWithLocalizedUnit(ingredient, translateUnit)
  const formatParts = (ingredient: string): IngredientParts => {
    const parsed = parseIngredient(ingredient)
    if (!parsed.qty) return { amount: '', name: format(ingredient) }
    const unitText = !parsed.unit
      ? ''
      : SHORT_UNITS.has(parsed.unit)
        ? parsed.unit
        : translateUnit(parsed.unit, parsed.qty)

    return {
      amount: [parsed.qty, unitText].filter(Boolean).join(' '),
      name: parsed.name,
    }
  }

  return { items, format, formatParts }
}
