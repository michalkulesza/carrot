import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { SaveComponent } from '@carrot/shared/types'
import { getIngredientQuantityCount } from '@carrot/shared/utils/ingredientUtils'
import {
  displayIngredientWithLocalizedUnit,
  getScaledIngredientValues,
} from './helpers'
import { formatIngredientParts } from '../../utils/ingredientDisplay'

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
  const formatParts = (ingredient: string): IngredientParts =>
    formatIngredientParts(ingredient, translateUnit)

  return { items, format, formatParts }
}
