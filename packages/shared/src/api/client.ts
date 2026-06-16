import type {
  RecipeSaveRequest,
  RecipeOut,
  RecipeStats,
  Tag,
  MealPlanEntry,
  UserPreferences,
  AllergenData,
  HouseholdOut,
  MemberOut,
  InvitationOut,
  ReanalyzeProgress,
  StreamCallbacks,
  ImportResult,
  AuthUser,
  RegisterData,
  ShoppingListItem,
  PresenceUser,
} from '../types'

export interface ApiClientConfig {
  baseUrl: string
  getAuthHeaders: () => Record<string, string>
  credentials?: RequestCredentials
  loginEndpoint?: string
  logoutEndpoint?: string
}

export const createApiClient = (config: ApiClientConfig) => {
  const {
    baseUrl,
    getAuthHeaders,
    credentials = 'include',
    loginEndpoint = '/api/auth/cookie/login',
    logoutEndpoint = '/api/auth/cookie/logout',
  } = config

  const apiFetch = (path: string, init: RequestInit = {}): Promise<Response> => {
    const authHeaders = getAuthHeaders()
    return fetch(`${baseUrl}${path}`, {
      credentials,
      ...init,
      headers: { ...authHeaders, ...(init.headers as Record<string, string> | undefined) },
    })
  }

  const throwOnError = async (res: Response, fallback: string): Promise<void> => {
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: unknown }
      throw new Error(typeof err.detail === 'string' ? err.detail : fallback)
    }
  }

  // ── Recipes ────────────────────────────────────────────────────────────────

  const saveRecipe = async (data: RecipeSaveRequest): Promise<RecipeOut> => {
    const res = await apiFetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await throwOnError(res, 'Failed to save recipe')
    return res.json() as Promise<RecipeOut>
  }

  const updateRecipe = async (id: string, data: RecipeSaveRequest): Promise<RecipeOut> => {
    const res = await apiFetch(`/api/recipes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await throwOnError(res, 'Failed to update recipe')
    return res.json() as Promise<RecipeOut>
  }

  const deleteRecipe = async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' })
    await throwOnError(res, 'Failed to delete recipe')
  }

  const fetchStats = async (): Promise<RecipeStats> => {
    const res = await apiFetch('/api/recipes/stats')
    if (!res.ok) throw new Error('Failed to load stats')
    return res.json() as Promise<RecipeStats>
  }

  const listRecipes = async (): Promise<RecipeOut[]> => {
    const res = await apiFetch('/api/recipes')
    if (!res.ok) throw new Error('Failed to load recipes')
    return res.json() as Promise<RecipeOut[]>
  }

  const listPersonalRecipes = async (): Promise<RecipeOut[]> => {
    const res = await apiFetch('/api/recipes?personal=true')
    if (!res.ok) throw new Error('Failed to load personal recipes')
    return res.json() as Promise<RecipeOut[]>
  }

  const linkRecipeToHousehold = async (id: string): Promise<RecipeOut> => {
    const res = await apiFetch(`/api/recipes/${id}/link-to-household`, { method: 'POST' })
    await throwOnError(res, 'Failed to link recipe')
    return res.json() as Promise<RecipeOut>
  }

  const toggleFavourite = async (recipeId: string): Promise<{ is_favourite: boolean }> => {
    const res = await apiFetch(`/api/recipes/${recipeId}/favourite`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to toggle favourite')
    return res.json() as Promise<{ is_favourite: boolean }>
  }

  const reorderRecipes = async (ids: string[]): Promise<void> => {
    const res = await apiFetch('/api/recipes/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) throw new Error('Failed to reorder recipes')
  }

  const importRecipes = async (file: File): Promise<{ imported: number }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await apiFetch('/api/recipes/import', { method: 'POST', body: form })
    await throwOnError(res, 'Import failed')
    return res.json() as Promise<{ imported: number }>
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  const listTags = async (): Promise<Tag[]> => {
    const res = await apiFetch('/api/tags')
    if (!res.ok) throw new Error('Failed to load tags')
    return res.json() as Promise<Tag[]>
  }

  const createTag = async (name: string): Promise<Tag> => {
    const res = await apiFetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    await throwOnError(res, 'Failed to create tag')
    return res.json() as Promise<Tag>
  }

  const addTagToRecipe = async (recipeId: string, tagId: string): Promise<void> => {
    const res = await apiFetch(`/api/recipes/${recipeId}/tags/${tagId}`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to add tag')
  }

  const removeTagFromRecipe = async (recipeId: string, tagId: string): Promise<void> => {
    const res = await apiFetch(`/api/recipes/${recipeId}/tags/${tagId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to remove tag')
  }

  // ── Meal Plan ──────────────────────────────────────────────────────────────

  const listMealPlan = async (month: string): Promise<MealPlanEntry[]> => {
    const res = await apiFetch(`/api/meal-plan?month=${month}`)
    if (!res.ok) throw new Error('Failed to load meal plan')
    return res.json() as Promise<MealPlanEntry[]>
  }

  const setMealPlanEntry = async (date: string, recipeId: string): Promise<MealPlanEntry> => {
    const res = await apiFetch(`/api/meal-plan/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: recipeId }),
    })
    if (!res.ok) throw new Error('Failed to set meal plan entry')
    return res.json() as Promise<MealPlanEntry>
  }

  const deleteMealPlanEntry = async (date: string): Promise<void> => {
    const res = await apiFetch(`/api/meal-plan/${date}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete meal plan entry')
  }

  // ── Preferences ────────────────────────────────────────────────────────────

  const getPreferences = async (): Promise<UserPreferences> => {
    const res = await apiFetch('/api/preferences')
    if (!res.ok) throw new Error('Failed to load preferences')
    return res.json() as Promise<UserPreferences>
  }

  const updatePreferences = async (data: Partial<UserPreferences>): Promise<UserPreferences> => {
    const res = await apiFetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update preferences')
    return res.json() as Promise<UserPreferences>
  }

  // ── Allergens ──────────────────────────────────────────────────────────────

  const updateHouseholdAllergens = async (
    householdId: string,
    allergens: AllergenData
  ): Promise<HouseholdOut> => {
    const res = await apiFetch(`/api/households/${householdId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allergens }),
    })
    await throwOnError(res, 'Failed to update allergens')
    return res.json() as Promise<HouseholdOut>
  }

  const streamReanalyze = (callbacks: {
    onStart: (total: number) => void
    onProgress: (done: number, total: number) => void
    onComplete: (analyzed: number) => void
    onError: (msg: string) => void
  }): () => void => {
    let aborted = false
    apiFetch('/api/allergens/reanalyze', { method: 'POST' })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          callbacks.onError('Failed to start re-analysis')
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const data = line.replace(/^data: /, '').trim()
            if (!data) continue
            try {
              const event = JSON.parse(data) as ReanalyzeProgress
              if (event.type === 'start') callbacks.onStart(event.total ?? 0)
              else if (event.type === 'progress')
                callbacks.onProgress(event.done ?? 0, event.total ?? 0)
              else if (event.type === 'complete')
                callbacks.onComplete(event.analyzed ?? 0)
            } catch {
              /* ignore */
            }
          }
        }
      })
      .catch(() => callbacks.onError('Connection error'))
    return () => { aborted = true }
  }

  // ── Households ─────────────────────────────────────────────────────────────

  const createHousehold = async (name?: string, color?: string): Promise<HouseholdOut> => {
    const res = await apiFetch('/api/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name ?? null, color: color ?? '#6366f1' }),
    })
    await throwOnError(res, 'Failed to create household')
    return res.json() as Promise<HouseholdOut>
  }

  const listHouseholds = async (): Promise<HouseholdOut[]> => {
    const res = await apiFetch('/api/households')
    if (!res.ok) throw new Error('Failed to load households')
    return res.json() as Promise<HouseholdOut[]>
  }

  const updateHousehold = async (
    id: string,
    data: { name?: string; color?: string }
  ): Promise<HouseholdOut> => {
    const res = await apiFetch(`/api/households/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await throwOnError(res, 'Failed to update household')
    return res.json() as Promise<HouseholdOut>
  }

  const leaveHousehold = async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/households/${id}/leave`, { method: 'POST' })
    await throwOnError(res, 'Failed to leave household')
  }

  const listMembers = async (householdId: string): Promise<MemberOut[]> => {
    const res = await apiFetch(`/api/households/${householdId}/members`)
    if (!res.ok) throw new Error('Failed to load members')
    return res.json() as Promise<MemberOut[]>
  }

  const switchHousehold = async (householdId: string | null): Promise<void> => {
    const res = await apiFetch('/api/me/active-household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ household_id: householdId }),
    })
    await throwOnError(res, 'Failed to switch context')
  }

  const inviteUser = async (householdId: string, email: string): Promise<void> => {
    const res = await apiFetch(`/api/households/${householdId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    await throwOnError(res, 'Failed to send invitation')
  }

  const listInvitations = async (): Promise<InvitationOut[]> => {
    const res = await apiFetch('/api/invitations')
    if (!res.ok) throw new Error('Failed to load invitations')
    return res.json() as Promise<InvitationOut[]>
  }

  const acceptInvitation = async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/invitations/${id}/accept`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to accept invitation')
  }

  const declineInvitation = async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/invitations/${id}/decline`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to decline invitation')
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  const ERROR_MESSAGES: Record<string, string> = {
    LOGIN_BAD_CREDENTIALS: 'Invalid email or password.',
    REGISTER_USER_ALREADY_EXISTS: 'An account with this email already exists.',
    REGISTER_INVALID_PASSWORD: 'Password must be at least 3 characters.',
  }

  const parseAuthError = (detail: unknown): string => {
    if (typeof detail === 'string') return ERROR_MESSAGES[detail] ?? detail
    return 'Something went wrong.'
  }

  const login = async (
    email: string,
    password: string
  ): Promise<{ access_token: string; token_type: string } | null> => {
    const body = new URLSearchParams({ username: email, password })
    const res = await fetch(`${baseUrl}${loginEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      credentials,
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { detail?: unknown }
      throw new Error(parseAuthError(data.detail))
    }
    const text = await res.text()
    if (!text) return null
    try {
      return JSON.parse(text) as { access_token: string; token_type: string }
    } catch {
      return null
    }
  }

  const register = async (data: RegisterData): Promise<AuthUser> => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials,
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: unknown }
      throw new Error(parseAuthError(err.detail))
    }
    return res.json() as Promise<AuthUser>
  }

  const logout = async (): Promise<void> => {
    await fetch(`${baseUrl}${logoutEndpoint}`, { method: 'POST', credentials })
  }

  const getMe = async (): Promise<AuthUser | null> => {
    const res = await apiFetch('/api/users/me')
    if (!res.ok) return null
    return res.json() as Promise<AuthUser>
  }

  // ── SSE streaming (fetch-based, works on mobile too) ──────────────────────

  const streamImportFetch = (url: string, callbacks: StreamCallbacks): () => void => {
    let aborted = false
    const controller = new AbortController()
    apiFetch(
      `/api/imports/stream?url=${encodeURIComponent(url)}&model=gemini-2.5-flash-lite`,
      { signal: controller.signal }
    )
      .then(async (res) => {
        if (!res.ok || !res.body) {
          callbacks.onError('Failed to start import')
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() ?? ''
          for (const chunk of chunks) {
            const data = chunk.replace(/^data: /, '').trim()
            if (!data) continue
            try {
              const event = JSON.parse(data) as {
                type: string
                key?: string
                label?: string
                result?: ImportResult
              }
              if (event.type === 'stage') {
                callbacks.onStage({ key: event.key ?? '', label: event.label ?? '' })
              } else if (event.type === 'done') {
                callbacks.onDone(event.result!)
              }
            } catch {
              /* ignore */
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (!aborted) callbacks.onError('Connection error — check the API server.')
        void err
      })
    return () => {
      aborted = true
      controller.abort()
    }
  }

  const _streamPostFetch = (path: string, body: unknown, callbacks: StreamCallbacks): () => void => {
    let aborted = false
    const controller = new AbortController()
    apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          callbacks.onError('Failed to start import')
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() ?? ''
          for (const chunk of chunks) {
            const data = chunk.replace(/^data: /, '').trim()
            if (!data) continue
            try {
              const event = JSON.parse(data) as {
                type: string
                key?: string
                label?: string
                result?: ImportResult
              }
              if (event.type === 'stage') {
                callbacks.onStage({ key: event.key ?? '', label: event.label ?? '' })
              } else if (event.type === 'done') {
                callbacks.onDone(event.result!)
              }
            } catch {
              /* ignore */
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (!aborted) callbacks.onError('Connection error — check the API server.')
        void err
      })
    return () => {
      aborted = true
      controller.abort()
    }
  }

  const streamTextImportFetch = (text: string, callbacks: StreamCallbacks): () => void =>
    _streamPostFetch('/api/imports/stream-text', { text, model: 'gemini-2.5-flash-lite' }, callbacks)

  const streamImageImportFetch = (imageBase64: string, mimeType: string, callbacks: StreamCallbacks): () => void =>
    _streamPostFetch('/api/imports/stream-image', { image_base64: imageBase64, mime_type: mimeType, model: 'gemini-2.5-flash-lite' }, callbacks)

  // ── Shopping List ──────────────────────────────────────────────────────────

  const listShoppingList = async (): Promise<ShoppingListItem[]> => {
    const res = await apiFetch('/api/shopping-list')
    if (!res.ok) throw new Error('Failed to load shopping list')
    return res.json() as Promise<ShoppingListItem[]>
  }

  const addShoppingListItems = async (items: string[]): Promise<ShoppingListItem[]> => {
    const res = await apiFetch('/api/shopping-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    await throwOnError(res, 'Failed to add items')
    return res.json() as Promise<ShoppingListItem[]>
  }

  const updateShoppingListItem = async (
    id: string,
    data: { text?: string; completed?: boolean }
  ): Promise<ShoppingListItem> => {
    const res = await apiFetch(`/api/shopping-list/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await throwOnError(res, 'Failed to update item')
    return res.json() as Promise<ShoppingListItem>
  }

  const reorderShoppingList = async (ids: string[]): Promise<void> => {
    const res = await apiFetch('/api/shopping-list/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    await throwOnError(res, 'Failed to reorder list')
  }

  const deleteShoppingListItem = async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/shopping-list/${id}`, { method: 'DELETE' })
    await throwOnError(res, 'Failed to delete item')
  }

  const clearCompletedShoppingList = async (): Promise<void> => {
    const res = await apiFetch('/api/shopping-list/completed', { method: 'DELETE' })
    await throwOnError(res, 'Failed to clear completed items')
  }

  const subscribeShoppingList = (
    onList: (items: ShoppingListItem[]) => void,
    onPresence: (users: PresenceUser[]) => void
  ): (() => void) => {
    let aborted = false
    const controller = new AbortController()
    apiFetch('/api/shopping-list/stream', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() ?? ''
          for (const chunk of chunks) {
            const line = chunk.trim()
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6)) as { type: string; items?: ShoppingListItem[]; users?: PresenceUser[] }
              if (event.type === 'list_snapshot' && event.items) onList(event.items)
              else if (event.type === 'presence' && event.users) onPresence(event.users)
            } catch { /* ignore malformed events */ }
          }
        }
      })
      .catch(() => {})
    return () => {
      aborted = true
      controller.abort()
    }
  }

  const postPresence = async (
    action: 'start' | 'stop' | 'keepalive',
    itemId: string | null
  ): Promise<void> => {
    const res = await apiFetch('/api/shopping-list/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, item_id: itemId }),
    })
    await throwOnError(res, 'Failed to update presence')
  }

  return {
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
    login,
    register,
    logout,
    getMe,
    streamImportFetch,
    streamTextImportFetch,
    streamImageImportFetch,
    listShoppingList,
    addShoppingListItems,
    updateShoppingListItem,
    reorderShoppingList,
    deleteShoppingListItem,
    clearCompletedShoppingList,
    subscribeShoppingList,
    postPresence,
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
