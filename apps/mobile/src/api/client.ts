import * as Sentry from '@sentry/react-native'
import { createApiClient } from '@carrot/shared/api/client'
import type { RecipePublicShare } from '@carrot/shared/types'

let _token: string | null = null
let unauthorizedHandler: (() => void) | null = null

export const setToken = (token: string | null): void => {
  _token = token
}

export const getToken = (): string | null => _token

export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  unauthorizedHandler = handler
}

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? ''

const getAuthHeaders = (): Record<string, string> =>
  _token ? { Authorization: `Bearer ${_token}` } : {}

export const mobileClient = createApiClient({
  baseUrl,
  getAuthHeaders,
  credentials: 'omit',
  loginEndpoint: '/api/auth/jwt/login',
  logoutEndpoint: '/api/auth/jwt/logout',
  reportError: (error, context) => {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { apiContext: context },
    })
  },
  onUnauthorized: () => unauthorizedHandler?.(),
  isAuthenticated: () => _token !== null,
})

export const createMobilePublicShare = async (recipeId: string): Promise<RecipePublicShare> => {
  const apiUrl = process.env.EXPO_PUBLIC_PUBLIC_SHARE_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? ''
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  const requestUrl = `${apiUrl}/api/recipes/${recipeId}/public-share`

  let response: Response
  try {
    response = await fetch(requestUrl, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    })
  } catch (error) {
    throw error
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: unknown }
    throw new Error(typeof body.detail === 'string' ? body.detail : 'Failed to create public share link')
  }

  return response.json() as Promise<RecipePublicShare>
}
