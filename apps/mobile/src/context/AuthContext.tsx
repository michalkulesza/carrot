import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import { mobileClient, setToken } from '../api/client'
import type { AuthUser, RegisterData } from '@platekeeper/shared/types'

const TOKEN_KEY = 'pk_auth_token'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY)
        if (stored) {
          setToken(stored)
          const me = await mobileClient.getMe()
          setUser(me)
        }
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const result = await mobileClient.login(email, password)
    if (result?.access_token) {
      await SecureStore.setItemAsync(TOKEN_KEY, result.access_token)
      setToken(result.access_token)
    }
    const me = await mobileClient.getMe()
    setUser(me)
  }, [])

  const register = useCallback(async (data: RegisterData): Promise<void> => {
    await mobileClient.register(data)
    await login(data.email, data.password)
  }, [login])

  const logout = useCallback(async (): Promise<void> => {
    await mobileClient.logout().catch(() => {})
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
