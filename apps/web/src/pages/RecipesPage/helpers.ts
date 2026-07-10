import type {
  HouseholdOut,
  RecipeOut,
  Tag,
  UserPreferences,
} from '@carrot/shared/types'

export interface IngredientMatch {
  recipe: RecipeOut
  matchedIngredient: string
}

export const getActiveAllergens = (
  activeHousehold: HouseholdOut | null,
  preferences: UserPreferences | null
): string[] => {
  if (activeHousehold?.allergens) {
    return [
      ...(activeHousehold.allergens.predefined ?? []),
      ...(activeHousehold.allergens.custom ?? []),
    ]
  }
  if (preferences?.personal_allergens) {
    return [
      ...(preferences.personal_allergens.predefined ?? []),
      ...(preferences.personal_allergens.custom ?? []),
    ]
  }

  return []
}

export const applyFavouriteOverrides = (
  recipes: RecipeOut[],
  favouriteOverrides: Map<string, boolean>
): RecipeOut[] =>
  recipes.map((r) => ({
    ...r,
    is_favourite: favouriteOverrides.has(r.id)
      ? favouriteOverrides.get(r.id)!
      : r.is_favourite,
  }))

export const filterAndSortRecipes = (
  recipes: RecipeOut[],
  filterFavourites: boolean,
  filterTag: Tag | null
): RecipeOut[] =>
  recipes
    .filter((r) => !filterFavourites || r.is_favourite)
    .filter((r) => !filterTag || r.tags.some((t) => t.id === filterTag.id))
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

export const searchTitleMatches = (
  recipes: RecipeOut[],
  query: string
): RecipeOut[] =>
  query ? recipes.filter((r) => r.title.toLowerCase().includes(query)) : []

export const searchIngredientMatches = (
  recipes: RecipeOut[],
  query: string
): IngredientMatch[] => {
  if (!query) return []
  const matches: IngredientMatch[] = []
  for (const recipe of recipes) {
    for (const component of recipe.components) {
      const match = component.ingredients.find((ing) =>
        ing.toLowerCase().includes(query)
      )
      if (match) {
        matches.push({ recipe, matchedIngredient: match })
        break
      }
    }
  }

  return matches
}
