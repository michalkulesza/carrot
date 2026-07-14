import { createApiClient } from '@carrot/shared/api/client'
export type {
  Unit,
  AllergenData,
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
  RecipeStats,
  MealPlanEntry,
  UserPreferences,
  ReanalyzeProgress,
  HouseholdOut,
  MemberOut,
  InvitationOut,
} from '@carrot/shared/types'
export { UNITS } from '@carrot/shared/types'

export const webClient = createApiClient({
  baseUrl: '',
  getAuthHeaders: () => ({}),
  credentials: 'include',
})

export const {
  saveRecipe,
  updateRecipe,
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
