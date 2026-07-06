import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, CardContent } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'
import GoogleSignInButton from '../components/GoogleSignInButton'

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed.'
      setError(
        msg === 'LOGIN_USER_NOT_VERIFIED' ? t('auth.notVerifiedError') : msg
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleCredential(idToken: string) {
    setError(null)
    setGoogleLoading(true)
    try {
      await loginWithGoogle(idToken)
      navigate('/', { replace: true })
    } catch {
      setError(t('auth.googleSignInError'))
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <LanguageSwitcher />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Carrot</h1>
          <p className="text-zinc-600 mt-1 text-sm">{t('auth.tagline')}</p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <h2 className="text-xl font-semibold">{t('auth.signIn')}</h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="email">
                  {t('auth.email')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="password">
                  {t('auth.password')}
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {error && <p className="text-danger text-sm">{error}</p>}

              <Button
                variant="primary"
                type="submit"
                isDisabled={loading}
                fullWidth
              >
                {loading ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
            </form>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-200" />
              <span className="text-xs text-zinc-500">
                {t('auth.orDivider')}
              </span>
              <div className="h-px flex-1 bg-zinc-200" />
            </div>

            {googleLoading ? (
              <p className="text-center text-sm text-zinc-600">
                {t('auth.signingIn')}
              </p>
            ) : (
              <GoogleSignInButton
                onCredential={handleGoogleCredential}
                onError={() => setError(t('auth.googleSignInError'))}
              />
            )}

            <p className="text-center text-sm text-zinc-600">
              {t('auth.noAccount')}{' '}
              <Link to="/register" className="text-primary font-medium">
                {t('auth.createOne')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
