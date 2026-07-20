import * as Sentry from '@sentry/react-native'
import { createApiClient } from '@carrot/shared/api/client'

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
