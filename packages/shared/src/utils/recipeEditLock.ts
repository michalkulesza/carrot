import { getConflictInfo, type ConflictInfo } from '../api/errors'

const ACQUIRE_TIMEOUT_MS = 5000
export const MIN_EDIT_PENDING_MS = 500
const TIMED_OUT = Symbol('timedOut')

export type RecipeLockedConflict = Extract<ConflictInfo, { code: 'recipe_locked' }>

export type AcquireResult =
  | { status: 'acquired' }
  | { status: 'locked'; conflict: RecipeLockedConflict }
  | { status: 'failed'; error?: unknown }

type RecipeEditLockApi = {
  setRecipeEditLock: (id: string, action: 'start' | 'keepalive' | 'stop') => Promise<void>
}

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise,
    new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), ms)),
  ])

export const acquireRecipeEditLock = async (
  api: RecipeEditLockApi,
  recipeId: string,
): Promise<AcquireResult> => {
  const request = api.setRecipeEditLock(recipeId, 'start')

  try {
    const outcome = await withTimeout(request, ACQUIRE_TIMEOUT_MS)
    if (outcome !== TIMED_OUT) return { status: 'acquired' }

    // Edit mode won't open, so don't keep a lock that lands after the timeout.
    void request.then(() => api.setRecipeEditLock(recipeId, 'stop')).catch(() => undefined)
    return { status: 'failed' }
  } catch (error) {
    const conflict = getConflictInfo(error)
    if (conflict?.code === 'recipe_locked') return { status: 'locked', conflict }
    return { status: 'failed', error }
  }
}
