import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import { mobileClient, setToken } from '../api/client'
import type { AuthUser, RegisterData } from '@platekeeper/shared/types'

const TOKEN_KEY = 'pk_auth_token'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  pendingEmail: string | null
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<void>
  resendCode: (email: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const pendingPasswordRef = useRef<string | null>(null)

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
    try {
      const result = await mobileClient.login(email, password)
      if (result?.access_token) {
        await SecureStore.setItemAsync(TOKEN_KEY, result.access_token)
        setToken(result.access_token)
      }
      const me = await mobileClient.getMe()
      setUser(me)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'LOGIN_USER_NOT_VERIFIED') {
        pendingPasswordRef.current = password
        setPendingEmail(email)
      }
      throw e
    }
  }, [])

  const register = useCallback(async (data: RegisterData): Promise<void> => {
    await mobileClient.register(data)
    pendingPasswordRef.current = data.password
    setPendingEmail(data.email)
  }, [])

  const verifyCode = useCallback(async (email: string, code: string): Promise<void> => {
    await mobileClient.verifyCode(email, code)
    const pwd = pendingPasswordRef.current
    if (pwd) {
      await login(email, pwd)
      pendingPasswordRef.current = null
      setPendingEmail(null)
    }
  }, [login])

  const resendCode = useCallback(async (email: string): Promise<void> => {
    await mobileClient.requestVerifyCode(email)
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    await mobileClient.logout().catch(() => {})
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async (): Promise<void> => {
    const me = await mobileClient.getMe()
    setUser(me)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, pendingEmail, login, register, verifyCode, resendCode, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
