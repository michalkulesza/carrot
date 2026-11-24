import type {
  HouseholdOut,
  ImportJob,
  RecipeOut,
  Tag,
  UserPreferences,
} from '@carrot/shared/types'
import { matchesTagFilters } from '@carrot/shared/utils/tagFilters'
import { unionAllergens } from '@carrot/shared/utils/unionAllergens'

export interface IngredientMatch {
  recipe: RecipeOut
  matchedIngredient: string
}

export const getActiveAllergens = (
  activeHousehold: HouseholdOut | null,
  preferences: UserPreferences | null
): string[] =>
  unionAllergens(activeHousehold?.allergens, preferences?.personal_allergens)

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
  allTags: Tag[],
  selectedTagIds: Set<string>
): RecipeOut[] =>
  recipes
    .filter((r) => !filterFavourites || r.is_favourite)
    .filter((r) => matchesTagFilters(r.tags, allTags, selectedTagIds))
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

const USER_ACTION_FAILURE_CODES = new Set([
  'user_action_required',
  'unsupported_source',
  'unsupported_language',
  'language_undetermined',
  'no_recipe_content',
  'ambiguous_recipe',
  'unreadable_content',
  'source_blocked',
])

export const isDuplicateImportFailure = (job: ImportJob): boolean =>
  job.status === 'failed' && job.failure_code === 'duplicate_recipe'

export const importJobRequiresUserAction = (job: ImportJob): boolean =>
  job.status === 'failed' &&
  USER_ACTION_FAILURE_CODES.has(job.failure_code ?? '')

export const importJobNeedsAttention = (job: ImportJob): boolean =>
  importJobRequiresUserAction(job) || isDuplicateImportFailure(job)

export const getImportJobMessageKey = (job: ImportJob): string => {
  if (job.status === 'running') return 'importJobs.running'
  if (job.status === 'failed')
    return `importJobs.failure.${job.failure_code ?? 'unexpected'}`
  if (job.status === 'pending' && job.retry_count > 0)
    return 'importJobs.takingLonger'

  return 'importJobs.pending'
}
