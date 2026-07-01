import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, CardContent } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function LoginPage() {
  const { login } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed.'
      if (msg === 'LOGIN_USER_NOT_VERIFIED') {
        navigate('/verify', { replace: true })
        return
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function fillDemo() {
    setEmail('demo@demo.com')
    setPassword('demo')
  }

  return (
    <main className="relative min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <LanguageSwitcher />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">PlateKeeper</h1>
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
                  required
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
                  required
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

            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <div className="flex-1 h-px bg-zinc-200" />
              <span>or</span>
              <div className="flex-1 h-px bg-zinc-200" />
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onPress={fillDemo}>
                {t('auth.demoAccount')}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onPress={() => {
                  setEmail('alt@demo.com')
                  setPassword('demo')
                }}
              >
                {t('auth.demoAlt')}
              </Button>
            </div>

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
