import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  requestSignupCode as apiRequestSignupCode,
  verifySignupCode as apiVerifySignupCode,
  completeSignup as apiCompleteSignup,
  type AuthUser,
} from '../api/auth'

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [signupEmail, setSignupEmail] = useState<string | null>(null)
  const [signupToken, setSignupToken] = useState<string | null>(null)

  useEffect(() => {
    getMe().then((u) => {
      setUser(u)
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

  async function refreshUser() {
    const u = await getMe()
    setUser(u)
  }

  async function login(email: string, password: string) {
    await apiLogin(email, password)
    setUser(await getMe())
  }

  async function requestSignupCode(email: string) {
    await apiRequestSignupCode(email)
    setSignupEmail(email)
    setSignupToken(null)
    localStorage.removeItem(PENDING_SIGNUP_KEY)
  }

  async function verifySignupCode(email: string, code: string) {
    const { token } = await apiVerifySignupCode(email, code)
    setSignupEmail(email)
    setSignupToken(token)
    localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({ email, token }))
  }

  async function completeSignup(password: string, nickname?: string) {
    if (!signupToken) throw new Error('No pending signup')
    await apiCompleteSignup(signupToken, password, nickname)
    localStorage.removeItem(PENDING_SIGNUP_KEY)
    setSignupEmail(null)
    setSignupToken(null)
    setUser(await getMe())
  }

  async function logout() {
    await apiLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signupEmail,
        signupToken,
        login,
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

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
