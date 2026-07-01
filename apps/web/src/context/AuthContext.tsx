import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  verifyCode as apiVerifyCode,
  requestVerifyCode as apiRequestVerifyCode,
  type AuthUser,
  type RegisterData,
} from '../api/auth'

const NOT_VERIFIED = 'LOGIN_USER_NOT_VERIFIED'

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const pendingPasswordRef = useRef<string | null>(null)

  useEffect(() => {
    getMe().then((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  async function refreshUser() {
    const u = await getMe()
    setUser(u)
  }

  async function login(email: string, password: string) {
    try {
      await apiLogin(email, password)
      setUser(await getMe())
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === NOT_VERIFIED) {
        pendingPasswordRef.current = password
        setPendingEmail(email)
      }
      throw e
    }
  }

  async function register(data: RegisterData) {
    await apiRegister(data)
    pendingPasswordRef.current = data.password
    setPendingEmail(data.email)
  }

  async function verifyCode(email: string, code: string) {
    await apiVerifyCode(email, code)
    const pwd = pendingPasswordRef.current
    if (pwd) {
      await apiLogin(email, pwd)
      pendingPasswordRef.current = null
      setPendingEmail(null)
      setUser(await getMe())
    }
  }

  async function resendCode(email: string) {
    await apiRequestVerifyCode(email)
  }

  async function logout() {
    await apiLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, pendingEmail, login, register, verifyCode, resendCode, logout, refreshUser }}
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
