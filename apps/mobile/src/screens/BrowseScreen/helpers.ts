import type { HouseholdOut, RecipeOut } from '@carrot/shared/types'

export type SortMode = 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'edited_newest' | 'edited_oldest'

export type BrowseFilters = { sort: SortMode; tagIds: Set<string>; favouritesOnly: boolean }
export type BrowsePreset = 'recent' | 'favourites'

export const DEFAULT_FILTERS: BrowseFilters = { sort: 'newest', tagIds: new Set(), favouritesOnly: false }

export const PRESET_FILTERS: Record<BrowsePreset, BrowseFilters> = {
  recent: { sort: 'newest', tagIds: new Set(), favouritesOnly: false },
  favourites: { sort: 'newest', tagIds: new Set(), favouritesOnly: true },
}

export const isBrowsePreset = (value: unknown): value is BrowsePreset => value === 'recent' || value === 'favourites'

export const SORT_OPTIONS: { key: SortMode; labelKey: string }[] = [
  { key: 'newest', labelKey: 'recipes.sortNewest' },
  { key: 'oldest', labelKey: 'recipes.sortOldest' },
  { key: 'edited_newest', labelKey: 'recipes.sortEditedNewest' },
  { key: 'edited_oldest', labelKey: 'recipes.sortEditedOldest' },
  { key: 'title_asc', labelKey: 'recipes.sortTitleAZ' },
  { key: 'title_desc', labelKey: 'recipes.sortTitleZA' },
]

export const CARD_HEIGHT = 100
export const CARD_GAP = 8
export const SEMANTIC_HEADER_HEIGHT = 38
export const SEMANTIC_LOADING_HEIGHT = 72
export const NO_RESULTS_HEIGHT = 120

export type HouseholdAvatar = { key: string; name: string; color: string }

export type BrowseListItem =
  | { type: 'recipe'; recipe: RecipeOut }
  | { type: 'semantic-header' }
  | { type: 'semantic-loading' }
  | { type: 'no-results' }

export type RecipeIndex = {
  normalizedTitles: Map<string, string>
  createdAt: Map<string, number>
  updatedAt: Map<string, number>
}

const DIACRITICS = /[̀-ͯ]/g

export const normalizeText = (text: string) => text.toLowerCase().normalize('NFD').replace(DIACRITICS, '').trim()

export const buildRecipeIndex = (recipes: RecipeOut[]): RecipeIndex => {
  const normalizedTitles = new Map<string, string>()
  const createdAt = new Map<string, number>()
  const updatedAt = new Map<string, number>()

  for (const recipe of recipes) {
    normalizedTitles.set(recipe.id, normalizeText(recipe.title))
    createdAt.set(recipe.id, new Date(recipe.created_at).getTime())
    updatedAt.set(recipe.id, new Date(recipe.updated_at).getTime())
  }

  return { normalizedTitles, createdAt, updatedAt }
}

export const sortRecipes = (recipes: RecipeOut[], sort: SortMode, index: RecipeIndex) => {
  const created = (r: RecipeOut) => index.createdAt.get(r.id) ?? 0
  const updated = (r: RecipeOut) => index.updatedAt.get(r.id) ?? 0

  return [...recipes].sort((a, b) => {
    if (sort === 'title_asc') return a.title.localeCompare(b.title)
    if (sort === 'title_desc') return b.title.localeCompare(a.title)
    if (sort === 'oldest') return created(a) - created(b)
    if (sort === 'edited_newest') return updated(b) - updated(a)
    if (sort === 'edited_oldest') return updated(a) - updated(b)
    return created(b) - created(a)
  })
}

export const applyFavouriteOverrides = (recipes: RecipeOut[], overrides: Map<string, boolean>) => {
  if (overrides.size === 0) return recipes

  return recipes.map((recipe) => {
    const override = overrides.get(recipe.id)
    return override === undefined || override === recipe.is_favourite ? recipe : { ...recipe, is_favourite: override }
  })
}

export const buildHouseholdAvatars = (recipes: RecipeOut[], households: HouseholdOut[]) => {
  const householdsById = new Map(households.map((household) => [household.id, household]))
  const avatarsByRecipeId = new Map<string, HouseholdAvatar[]>()

  for (const recipe of recipes) {
    const avatars: HouseholdAvatar[] = []
    for (const id of recipe.household_ids) {
      const household = householdsById.get(id)
      if (household) avatars.push({ key: household.id, name: household.name, color: household.color })
    }
    avatarsByRecipeId.set(recipe.id, avatars)
  }

  return avatarsByRecipeId
}

export const getBrowseItemKey = (item: BrowseListItem) => (item.type === 'recipe' ? item.recipe.id : item.type)

export const buildBrowseItems = ({
  literal,
  semantic,
  hasQuery,
  isSemanticLoading,
}: {
  literal: RecipeOut[]
  semantic: RecipeOut[]
  hasQuery: boolean
  isSemanticLoading: boolean
}): BrowseListItem[] => {
  const items: BrowseListItem[] = []

  if (hasQuery && literal.length === 0) items.push({ type: 'no-results' })
  for (const recipe of literal) items.push({ type: 'recipe', recipe })

  if (!hasQuery) return items

  if (semantic.length > 0) {
    items.push({ type: 'semantic-header' })
    for (const recipe of semantic) items.push({ type: 'recipe', recipe })
  } else if (isSemanticLoading) {
    items.push({ type: 'semantic-header' }, { type: 'semantic-loading' })
  }

  return items
}

export const getBrowseItemType = (item: BrowseListItem) => item.type
