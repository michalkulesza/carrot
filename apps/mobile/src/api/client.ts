import * as Sentry from '@sentry/react-native'
import { createApiClient } from '@carrot/shared/api/client'

let _token: string | null = null

export const setToken = (token: string | null): void => {
  _token = token
}

export const getToken = (): string | null => _token

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
})
