import { createApiClient } from '@carrot/shared/api/client'
import type { StreamCallbacks, ImportResult } from '@carrot/shared/types'

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
  ImportResult,
  StageEvent,
  StreamCallbacks,
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
  streamTextImportFetch,
  streamImageImportFetch,
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

type ImportStreamMessage =
  | { type: 'stage'; key: string; label: string }
  | { type: 'done'; result: ImportResult }

export function streamImport(
  url: string,
  callbacks: StreamCallbacks
): () => void {
  const streamUrl = `/api/imports/stream?url=${encodeURIComponent(url)}&model=gemini-2.5-flash-lite`
  const source = new EventSource(streamUrl)

  source.onmessage = (event) => {
    const data = JSON.parse(event.data as string) as ImportStreamMessage
    if (data.type === 'stage') {
      callbacks.onStage({ key: data.key, label: data.label })
    } else if (data.type === 'done') {
      callbacks.onDone(data.result)
      source.close()
    }
  }
  source.onerror = () => {
    callbacks.onError('Connection error — check the API server.')
    source.close()
  }

  return () => source.close()
}
