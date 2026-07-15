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
  HouseholdLeaveNotificationOut,
  ReanalyzeProgress,
  ImportJobEnqueue,
  ImportJobOut,
  ImportJob,
  ImportJobsSnapshot,
  AuthUser,
  ShoppingListItem,
  PresenceUser,
} from '../types'

export interface ApiClientConfig {
  baseUrl: string
  getAuthHeaders: () => Record<string, string>
  credentials?: RequestCredentials
  loginEndpoint?: string
  logoutEndpoint?: string
  /** Called with the raw, unfiltered error when a request fails below the HTTP layer
   * (network/TLS/DNS failures) — wire this to Sentry or similar. The user only ever
   * sees the generic message thrown alongside it. */
  reportError?: (error: unknown, context: string) => void
}

const GENERIC_NETWORK_ERROR = 'Unable to connect to the server. Please check your connection and try again.'

export const createApiClient = (config: ApiClientConfig) => {
  const {
    baseUrl,
    getAuthHeaders,
    credentials = 'include',
    loginEndpoint = '/api/auth/cookie/login',
    logoutEndpoint = '/api/auth/cookie/logout',
    reportError,
  } = config

  const rawFetch = async (url: string, init: RequestInit, context: string): Promise<Response> => {
    try {
      return await fetch(url, init)
    } catch (err) {
      reportError?.(err, context)
      throw new Error(GENERIC_NETWORK_ERROR)
    }
  }

  const apiFetch = (path: string, init: RequestInit = {}): Promise<Response> => {
    const authHeaders = getAuthHeaders()
    return rawFetch(
      `${baseUrl}${path}`,
      {
        credentials,
        ...init,
        headers: { ...authHeaders, ...(init.headers as Record<string, string> | undefined) },
      },
      path
    )
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

  const linkRecipeToHousehold = async (id: string, householdId?: string): Promise<RecipeOut> => {
    const query = householdId ? `?target_household_id=${encodeURIComponent(householdId)}` : ''
    const res = await apiFetch(`/api/recipes/${id}/link-to-household${query}`, { method: 'POST' })
    await throwOnError(res, 'Failed to link recipe')
    return res.json() as Promise<RecipeOut>
  }

  const linkRecipeToPersonal = async (id: string): Promise<RecipeOut> => {
    const res = await apiFetch(`/api/recipes/${id}/link-to-personal`, { method: 'POST' })
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

  const uploadThumbnail = async (file: File, recipeId: string): Promise<{ url: string }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await apiFetch(`/api/images/thumbnail?recipe_id=${encodeURIComponent(recipeId)}`, {
      method: 'POST',
      body: form,
    })
    await throwOnError(res, 'Upload failed')
    return res.json() as Promise<{ url: string }>
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  const listTags = async (): Promise<Tag[]> => {
    const res = await apiFetch('/api/tags')
    if (!res.ok) throw new Error('Failed to load tags')
    return res.json() as Promise<Tag[]>
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

  const getNextMealPlanEntry = async (from: string): Promise<MealPlanEntry | null> => {
    const res = await apiFetch(`/api/meal-plan/next?from=${encodeURIComponent(from)}`)
    if (!res.ok) throw new Error('Failed to load next meal plan entry')
    return res.json() as Promise<MealPlanEntry | null>
  }

  const setMealPlanEntry = async (
    date: string,
    entry: { recipeId?: string; text?: string },
  ): Promise<MealPlanEntry> => {
    const res = await apiFetch(`/api/meal-plan/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: entry.recipeId, text: entry.text }),
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
      .catch((err: unknown) => {
        reportError?.(err, 'streamReanalyze')
        callbacks.onError('Connection error')
      })
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

  const listHouseholdLeaveNotifications = async (): Promise<HouseholdLeaveNotificationOut[]> => {
    const res = await apiFetch('/api/household-leave-notifications')
    if (!res.ok) throw new Error('Failed to load notifications')
    return res.json() as Promise<HouseholdLeaveNotificationOut[]>
  }

  const dismissHouseholdLeaveNotification = async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/household-leave-notifications/${id}/dismiss`, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to dismiss notification')
  }

  // ── Signup (verify-before-account) ────────────────────────────────────────

  const requestSignupCode = async (email: string): Promise<void> => {
    const res = await rawFetch(`${baseUrl}/api/auth/request-signup-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials,
    }, 'requestSignupCode')
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: unknown }
      throw new Error(parseAuthError(err.detail))
    }
  }

  const verifySignupCode = async (email: string, code: string): Promise<{ token: string }> => {
    const res = await rawFetch(`${baseUrl}/api/auth/verify-signup-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
      credentials,
    }, 'verifySignupCode')
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: unknown }
      throw new Error(parseAuthError(err.detail))
    }
    return res.json() as Promise<{ token: string }>
  }

  const completeSignup = async (
    token: string,
    password: string,
    nickname?: string
  ): Promise<{ access_token: string; token_type: string }> => {
    const res = await rawFetch(`${baseUrl}/api/auth/complete-signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, nickname: nickname ?? null }),
      credentials,
    }, 'completeSignup')
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: unknown }
      throw new Error(parseAuthError(err.detail))
    }
    return res.json() as Promise<{ access_token: string; token_type: string }>
  }

  const googleLogin = async (idToken: string): Promise<{ access_token: string; token_type: string }> => {
    const res = await rawFetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
      credentials,
    }, 'googleLogin')
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: unknown }
      throw new Error(parseAuthError(err.detail))
    }
    return res.json() as Promise<{ access_token: string; token_type: string }>
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  const ERROR_MESSAGES: Record<string, string> = {
    LOGIN_BAD_CREDENTIALS: 'Invalid email or password.',
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
    const res = await rawFetch(`${baseUrl}${loginEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      credentials,
    }, 'login')
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

  const logout = async (): Promise<void> => {
    try {
      await fetch(`${baseUrl}${logoutEndpoint}`, { method: 'POST', credentials })
    } catch (err) {
      reportError?.(err, 'logout')
    }
  }

  const getMe = async (): Promise<AuthUser | null> => {
    const res = await apiFetch('/api/users/me')
    if (!res.ok) return null
    return res.json() as Promise<AuthUser>
  }

  const deleteAccount = async (): Promise<void> => {
    const res = await apiFetch('/api/users/me', { method: 'DELETE' })
    await throwOnError(res, 'Failed to delete account')
  }

  // ── SSE streaming (fetch-based, works on mobile too) ──────────────────────

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

  /** Subscribes to an SSE stream, dispatching each `data:` event to onEvent. Returns an unsubscribe fn. */
  const subscribeStream = <TEvent extends { type: string }>(
    path: string,
    onEvent: (event: TEvent) => void,
    context: string
  ): (() => void) => {
    let aborted = false
    const controller = new AbortController()
    apiFetch(path, { signal: controller.signal })
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
              onEvent(JSON.parse(line.slice(6)) as TEvent)
            } catch { /* ignore malformed events */ }
          }
        }
      })
      .catch((err: unknown) => reportError?.(err, context))
    return () => {
      aborted = true
      controller.abort()
    }
  }

  const subscribeShoppingList = (
    onList: (items: ShoppingListItem[]) => void,
    onPresence: (users: PresenceUser[]) => void
  ): (() => void) =>
    subscribeStream<{ type: string; items?: ShoppingListItem[]; users?: PresenceUser[] }>(
      '/api/shopping-list/stream',
      (event) => {
        if (event.type === 'list_snapshot' && event.items) onList(event.items)
        else if (event.type === 'presence' && event.users) onPresence(event.users)
      },
      'subscribeShoppingList'
    )

  const subscribeMealPlan = (onChange: () => void): (() => void) =>
    subscribeStream<{ type: string }>(
      '/api/meal-plan/stream',
      (event) => {
        if (event.type === 'meal_plan_changed') onChange()
      },
      'subscribeMealPlan'
    )

  const subscribeRecipes = (onChange: () => void): (() => void) =>
    subscribeStream<{ type: string }>(
      '/api/recipes/stream',
      (event) => {
        if (event.type === 'recipe_changed') onChange()
      },
      'subscribeRecipes'
    )

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

  // ── Import jobs ────────────────────────────────────────────────────────────

  const enqueueImportJob = async (data: ImportJobEnqueue): Promise<ImportJobOut> => {
    const res = await apiFetch('/api/imports/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    await throwOnError(res, 'Failed to enqueue import job')
    return res.json() as Promise<ImportJobOut>
  }

  const retryImportJob = async (id: string): Promise<ImportJob> => {
    const res = await apiFetch(`/api/imports/jobs/${id}/retry`, { method: 'POST' })
    await throwOnError(res, 'Failed to retry import job')
    return res.json() as Promise<ImportJob>
  }

  const cancelImportJob = async (id: string): Promise<ImportJob> => {
    const res = await apiFetch(`/api/imports/jobs/${id}/cancel`, { method: 'POST' })
    await throwOnError(res, 'Failed to cancel import job')
    return res.json() as Promise<ImportJob>
  }

  const dismissImportJob = async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/imports/jobs/${id}/dismiss`, { method: 'POST' })
    await throwOnError(res, 'Failed to dismiss import job')
  }

  const registerDevice = async (installationId: string, token: string): Promise<void> => {
    const res = await apiFetch('/api/imports/devices', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installation_id: installationId, token }),
    })
    await throwOnError(res, 'Failed to register notifications')
  }

  const unregisterDevice = async (installationId: string): Promise<void> => {
    const res = await apiFetch(`/api/imports/devices/${encodeURIComponent(installationId)}`, { method: 'DELETE' })
    await throwOnError(res, 'Failed to unregister notifications')
  }

  const subscribeImportJobs = (
    onSnapshot: (snapshot: ImportJobsSnapshot) => void,
    onEvent: (event: { id: number; type: string; job: ImportJob }) => void,
    lastEventId?: number,
    onDisconnect?: () => void,
  ): (() => void) => {
    const controller = new AbortController()
    let stopped = false
    void apiFetch('/api/imports/jobs/events', {
      signal: controller.signal,
      headers: lastEventId ? { 'Last-Event-ID': String(lastEventId) } : {},
    }).then(async (res) => {
      if (!res.ok || !res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (!stopped) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const messages = buffer.split('\n\n')
        buffer = messages.pop() ?? ''
        for (const message of messages) {
          const type = message.match(/^event: (.+)$/m)?.[1]
          const id = Number(message.match(/^id: (.+)$/m)?.[1] ?? 0)
          const data = message.match(/^data: (.+)$/m)?.[1]
          if (!type || !data) continue
          try {
            if (type === 'import_jobs.snapshot') onSnapshot(JSON.parse(data) as ImportJobsSnapshot)
            else onEvent({ id, type, job: JSON.parse(data) as ImportJob })
          } catch {
            // Ignore malformed messages and retain the current authoritative cache.
          }
        }
      }
    }).catch((error: unknown) => {
      if (!stopped) reportError?.(error, 'subscribeImportJobs')
    }).finally(() => {
      if (!stopped) onDisconnect?.()
    })
    return () => {
      stopped = true
      controller.abort()
    }
  }

  return {
    saveRecipe,
    updateRecipe,
    deleteRecipe,
    fetchStats,
    listRecipes,
    subscribeRecipes,
    listPersonalRecipes,
    linkRecipeToHousehold,
    linkRecipeToPersonal,
    toggleFavourite,
    reorderRecipes,
    importRecipes,
    uploadThumbnail,
    listTags,
    addTagToRecipe,
    removeTagFromRecipe,
    listMealPlan,
    getNextMealPlanEntry,
    setMealPlanEntry,
    deleteMealPlanEntry,
    subscribeMealPlan,
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
    listHouseholdLeaveNotifications,
    dismissHouseholdLeaveNotification,
    requestSignupCode,
    verifySignupCode,
    completeSignup,
    googleLogin,
    login,
    logout,
    getMe,
    deleteAccount,
    enqueueImportJob,
    retryImportJob,
    cancelImportJob,
    dismissImportJob,
    registerDevice,
    unregisterDevice,
    subscribeImportJobs,
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
