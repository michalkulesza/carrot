import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as Sentry from '@sentry/react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getMe,
  login as apiLogin,
  loginWithGoogle as apiLoginWithGoogle,
  logout as apiLogout,
  requestSignupCode as apiRequestSignupCode,
  verifySignupCode as apiVerifySignupCode,
  completeSignup as apiCompleteSignup,
  type AuthUser,
} from '../api/auth'

const syncSentryUser = (u: AuthUser | null) => {
  Sentry.setUser(u ? { id: u.id, email: u.email } : null)
}

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
  loginWithGoogle: (idToken: string) => Promise<void>
  requestSignupCode: (email: string) => Promise<void>
  verifySignupCode: (email: string, code: string) => Promise<void>
  completeSignup: (password: string, nickname?: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const loadPendingSignup = (): PendingSignup | null => {
  const raw = localStorage.getItem(PENDING_SIGNUP_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PendingSignup
  } catch {
    return null
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [signupEmail, setSignupEmail] = useState<string | null>(null)
  const [signupToken, setSignupToken] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    getMe().then((u) => {
      setUser(u)
      syncSentryUser(u)

      if (!u) {
        const pending = loadPendingSignup()
        if (pending) {
          setSignupEmail(pending.email)
          setSignupToken(pending.token)
        }
      }
      setLoading(false)
    })
  }, [])

  const refreshUser = useCallback(async () => {
    const u = await getMe()
    setUser(u)
    syncSentryUser(u)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password)

    const u = await getMe()
    setUser(u)
    syncSentryUser(u)
  }, [])

  const loginWithGoogle = useCallback(async (idToken: string) => {
    await apiLoginWithGoogle(idToken)

    const u = await getMe()
    setUser(u)
    syncSentryUser(u)
  }, [])

  const requestSignupCode = useCallback(async (email: string) => {
    await apiRequestSignupCode(email)
    setSignupEmail(email)
    setSignupToken(null)
    localStorage.removeItem(PENDING_SIGNUP_KEY)
  }, [])

  const verifySignupCode = useCallback(async (email: string, code: string) => {
    const { token } = await apiVerifySignupCode(email, code)
    setSignupEmail(email)
    setSignupToken(token)
    localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({ email, token }))
  }, [])

  const completeSignup = useCallback(
    async (password: string, nickname?: string) => {
      if (!signupToken) throw new Error('No pending signup')
      await apiCompleteSignup(signupToken, password, nickname)
      localStorage.removeItem(PENDING_SIGNUP_KEY)
      setSignupEmail(null)
      setSignupToken(null)

      const u = await getMe()
      setUser(u)
      syncSentryUser(u)
    },
    [signupToken]
  )

  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
    syncSentryUser(null)
    // Prevents the next account to log in on this browser from seeing this account's
    // cached households/recipes/preferences until every query happens to refetch.
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(
    () => ({
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
    }),
    [
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
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')

  return ctx
}
