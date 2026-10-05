import {
  displayIngredientWithLocalizedUnit,
  parseIngredient,
  type StructuredIngredient,
} from '@carrot/shared/utils/ingredientUtils'

export interface IngredientDisplayParts {
  amount: string
  name: string
}

export const formatIngredientParts = (
  ingredient: string,
  translateUnit: (unit: string, qty: string) => string,
  parse: (ingredient: string) => StructuredIngredient = parseIngredient
): IngredientDisplayParts => {
  const parsed = parse(ingredient)
  const unit = parsed.unit ? translateUnit(parsed.unit, parsed.qty) : ''

  return parsed.qty
    ? {
        amount: [parsed.qty, unit].filter(Boolean).join(' '),
        name: parsed.name,
      }
    : {
        amount: '',
        name: displayIngredientWithLocalizedUnit(ingredient, translateUnit),
      }
}
