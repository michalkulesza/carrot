import { createApiClient } from '@carrot/shared/api/client'
export type {
  Unit,
  AllergenFlag,
  Ingredient,
  StepRef,
  RecipeComponent,
  Tag,
  RecipeGroup,
  ImportMetadata,
  ImportStage,
  StepIngredientRef,
  SaveComponent,
  RecipeSaveRequest,
  RecipeOut,
  PublicRecipeOut,
  RecipePublicShare,
  RecipeStats,
  MealPlanEntry,
  UserPreferences,
  ReanalyzeProgress,
  HouseholdOut,
  MemberOut,
  InvitationOut,
} from '@carrot/shared/types'
export { UNITS } from '@carrot/shared/types'

let unauthorizedHandler: (() => void) | null = null

export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  unauthorizedHandler = handler
}

export const webClient = createApiClient({
  baseUrl: '',
  getAuthHeaders: () => ({}),
  credentials: 'include',
  onUnauthorized: () => unauthorizedHandler?.(),
})

export const {
  saveRecipe,
  updateRecipe,
  createPublicShare,
  fetchPublicRecipe,
  addPublicRecipeToLibrary,
  deleteRecipe,
  fetchStats,
  listRecipes,
  listPersonalRecipes,
  linkRecipeToHousehold,
  toggleFavourite,
  reorderRecipes,
  importRecipes,
  uploadThumbnail,
  listTags,
  createTag,
  addTagToRecipe,
  removeTagFromRecipe,
  listMealPlan,
  setMealPlanEntry,
  deleteMealPlanEntry,
  getPreferences,
  updatePreferences,
  updateHouseholdAllergens,
  streamReanalyze,
  createHousehold,
  listHouseholds,
  updateHousehold,
  leaveHousehold,
  listMembers,
  switchHousehold,
  inviteUser,
  listInvitations,
  acceptInvitation,
  declineInvitation,
  enqueueImportJob,
  retryImportJob,
  cancelImportJob,
  dismissImportJob,
} = webClient

export async function exportRecipes(): Promise<void> {
  const res = await fetch('/api/recipes/export', { credentials: 'include' })
  if (!res.ok) throw new Error('Export failed')

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = 'recipes.csv'
  a.click()
  URL.revokeObjectURL(url)
}
