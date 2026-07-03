import { createApiClient } from '@platekeeper/shared/api/client'

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
} from '@platekeeper/shared/types'
export { UNITS } from '@platekeeper/shared/types'

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

// ── Web-only: DOM download trigger ────────────────────────────────────────────

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

// ── Web-only: EventSource-based import stream (v2 mobile uses fetch SSE) ─────

import type { StreamCallbacks, ImportResult } from '@platekeeper/shared/types'

export function streamImport(url: string, callbacks: StreamCallbacks): () => void {
  const source = new EventSource(
    `/api/imports/stream?url=${encodeURIComponent(url)}&model=gemini-2.5-flash-lite`
  )
  source.onmessage = (event) => {
    const data = JSON.parse(event.data as string)
    if (data.type === 'stage') {
      callbacks.onStage({ key: data.key as string, label: data.label as string })
    } else if (data.type === 'done') {
      callbacks.onDone(data.result as ImportResult)
      source.close()
    }
  }
  source.onerror = () => {
    callbacks.onError('Connection error — check the API server.')
    source.close()
  }
  return () => source.close()
}
