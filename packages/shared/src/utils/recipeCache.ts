import type { MealPlanEntry, RecipeOut } from '../types'

export const upsertRecipe = (list: RecipeOut[] | undefined, recipe: RecipeOut): RecipeOut[] => {
  if (!list) return [recipe]
  const exists = list.some((item) => item.id === recipe.id)
  if (!exists) return [recipe, ...list]
  return list.map((item) => (item.id === recipe.id ? recipe : item))
}

export const removeRecipeById = (list: RecipeOut[] | undefined, id: string): RecipeOut[] =>
  list?.filter((item) => item.id !== id) ?? []

const asEntries = (data: unknown): MealPlanEntry[] => {
  if (Array.isArray(data)) return data as MealPlanEntry[]
  if (data && typeof data === 'object') return [data as MealPlanEntry]
  return []
}

export const mealPlanDataReferencesRecipe = (data: unknown, recipeIds: ReadonlySet<string>): boolean =>
  asEntries(data).some((entry) => entry?.recipe != null && recipeIds.has(entry.recipe.id))
