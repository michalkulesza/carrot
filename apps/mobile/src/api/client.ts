import { createApiClient } from '@carrot/shared/api/client'
import { syncSharedAuth } from '../utils/sharedAuth'

let _token: string | null = null

export const setToken = (token: string | null): void => {
  _token = token
  syncSharedAuth(token)
}

export const getToken = (): string | null => _token

export const mobileClient = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  getAuthHeaders: () => (_token ? { Authorization: `Bearer ${_token}` } : ({} as Record<string, string>)),
  credentials: 'omit',
  loginEndpoint: '/api/auth/jwt/login',
  logoutEndpoint: '/api/auth/jwt/logout',
})
