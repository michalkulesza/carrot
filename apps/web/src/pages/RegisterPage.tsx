import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, CardContent } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'

const ACCOUNT_EXISTS = 'ACCOUNT_EXISTS'

export default function RegisterPage() {
  const { requestSignupCode } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await requestSignupCode(email)
      navigate('/verify', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg === ACCOUNT_EXISTS ? t('auth.accountExistsError') : (msg || 'Registration failed.'))
    } finally {
      setLoading(false)
    }
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
            <div>
              <h2 className="text-xl font-semibold">{t('auth.createAccount')}</h2>
              <p className="text-sm text-zinc-600 mt-1">{t('auth.signupEmailSubtitle')}</p>
            </div>

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

              {error && <p className="text-danger text-sm">{error}</p>}

              <Button
                variant="primary"
                type="submit"
                isDisabled={loading}
                fullWidth
              >
                {loading ? t('auth.creating') : t('auth.continue')}
              </Button>
            </form>

            <p className="text-center text-sm text-zinc-600">
              {t('auth.alreadyHaveAccount')}{' '}
              <Link to="/login" className="text-primary font-medium">
                {t('auth.signIn')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
