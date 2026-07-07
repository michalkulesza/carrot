import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import { mobileClient, setToken } from '../api/client'
import { signInWithGoogle } from '../utils/googleAuth'
import type { AuthUser } from '@platekeeper/shared/types'

const TOKEN_KEY = 'pk_auth_token'
const PENDING_SIGNUP_KEY = 'pk_pending_signup'

interface PendingSignup {
  email: string
  token: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  signupEmail: string | null
  signupToken: string | null
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  requestSignupCode: (email: string) => Promise<void>
  verifySignupCode: (email: string, code: string) => Promise<void>
  completeSignup: (password: string, nickname?: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [signupEmail, setSignupEmail] = useState<string | null>(null)
  const [signupToken, setSignupToken] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY)
        if (stored) {
          setToken(stored)
          const me = await mobileClient.getMe()
          setUser(me)
        }
        if (!stored) {
          const pendingRaw = await SecureStore.getItemAsync(PENDING_SIGNUP_KEY)
          if (pendingRaw) {
            const pending = JSON.parse(pendingRaw) as PendingSignup
            setSignupEmail(pending.email)
            setSignupToken(pending.token)
          }
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

  const loginWithGoogle = useCallback(async (): Promise<void> => {
    const idToken = await signInWithGoogle()
    const result = await mobileClient.googleLogin(idToken)
    await SecureStore.setItemAsync(TOKEN_KEY, result.access_token)
    setToken(result.access_token)
    const me = await mobileClient.getMe()
    setUser(me)
  }, [])

  const requestSignupCode = useCallback(async (email: string): Promise<void> => {
    await mobileClient.requestSignupCode(email)
    setSignupEmail(email)
    setSignupToken(null)
    await SecureStore.deleteItemAsync(PENDING_SIGNUP_KEY)
  }, [])

  const verifySignupCode = useCallback(async (email: string, code: string): Promise<void> => {
    const { token } = await mobileClient.verifySignupCode(email, code)
    setSignupEmail(email)
    setSignupToken(token)
    await SecureStore.setItemAsync(PENDING_SIGNUP_KEY, JSON.stringify({ email, token }))
  }, [])

  const completeSignup = useCallback(async (password: string, nickname?: string): Promise<void> => {
    if (!signupToken) throw new Error('No pending signup')
    const result = await mobileClient.completeSignup(signupToken, password, nickname)
    await SecureStore.setItemAsync(TOKEN_KEY, result.access_token)
    setToken(result.access_token)
    await SecureStore.deleteItemAsync(PENDING_SIGNUP_KEY)
    const me = await mobileClient.getMe()
    // Clear the pending-signup state together with setting the user (same tick, batched)
    // so screens never render the in-between state of "no token, no user" — that gap
    // is what caused a login-screen flash before landing on the main app.
    setUser(me)
    setSignupEmail(null)
    setSignupToken(null)
  }, [signupToken])

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
    <AuthContext.Provider
      value={{
        user,
        loading,
        signupEmail,
        signupToken,
        login,
        loginWithGoogle,
        requestSignupCode,
        verifySignupCode,
        completeSignup,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
