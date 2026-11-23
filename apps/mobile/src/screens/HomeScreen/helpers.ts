import type { RecipeOut } from '@carrot/shared/types'

export const SHELF_CARD_WIDTH = 140
export const SHELF_GAP = 12
export const SHELF_LIMIT = 10

export const getShelfItemLayout = (_data: ArrayLike<RecipeOut> | null | undefined, index: number) => ({
  length: SHELF_CARD_WIDTH + SHELF_GAP,
  offset: (SHELF_CARD_WIDTH + SHELF_GAP) * index,
  index,
})

const newestFirst = (recipes: RecipeOut[]) =>
  recipes
    .map((recipe) => ({ recipe, createdAt: new Date(recipe.created_at).getTime() }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, SHELF_LIMIT)
    .map(({ recipe }) => recipe)

export const getRecentlyAdded = (recipes: RecipeOut[]) => newestFirst(recipes)

export const getFavourites = (recipes: RecipeOut[]) => newestFirst(recipes.filter((recipe) => recipe.is_favourite))
