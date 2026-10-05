import { useCallback, useState } from 'react'
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import type {
  RecipeOut,
  SaveComponent,
  ShoppingListItemInput,
} from '@carrot/shared/types'
import { getShoppingListIngredient } from './helpers'

const ingredientKey = (componentIndex: number, ingredientIndex: number) =>
  `${componentIndex}-${ingredientIndex}`

export const useShoppingListActions = (
  recipe: RecipeOut | null,
  unitSystem: string,
  servingScale: number
) => {
  const { addItems } = useShoppingList()
  const [sessionAdded, setSessionAdded] = useState<Set<string>>(new Set())

  const resetSessionAdded = useCallback(() => setSessionAdded(new Set()), [])

  const buildItem = (
    component: SaveComponent,
    ingredientIndex: number
  ): ShoppingListItemInput => ({
    id: crypto.randomUUID(),
    text: getShoppingListIngredient(
      component,
      ingredientIndex,
      unitSystem,
      servingScale
    ),
    category: component.shopping_list_categories?.[ingredientIndex] ?? 'other',
  })

  const handleAddIngredient = (ci: number, ii: number) => {
    if (!recipe || sessionAdded.has(ingredientKey(ci, ii))) return
    const component = (recipe.components as SaveComponent[])[ci]
    addItems.mutate([buildItem(component, ii)])
    setSessionAdded((prev) => new Set(prev).add(ingredientKey(ci, ii)))
  }

  const handleAddAllIngredients = (ci: number) => {
    if (!recipe) return
    const component = (recipe.components as SaveComponent[])[ci]
    const keys: string[] = []
    const items: ShoppingListItemInput[] = []
    component.ingredients.forEach((_, ii) => {
      const key = ingredientKey(ci, ii)
      if (sessionAdded.has(key)) return
      keys.push(key)
      items.push(buildItem(component, ii))
    })
    if (items.length === 0) return
    addItems.mutate(items)
    setSessionAdded((prev) => new Set([...prev, ...keys]))
  }

  const handleAddAllUnifiedIngredients = () => {
    recipe?.components.forEach((_, componentIndex) =>
      handleAddAllIngredients(componentIndex)
    )
  }

  return {
    sessionAdded,
    resetSessionAdded,
    handleAddIngredient,
    handleAddAllIngredients,
    handleAddAllUnifiedIngredients,
  }
}
