import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardContent } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

const RESEND_COOLDOWN = 60

export default function VerifyPage() {
  const { pendingEmail, verifyCode, resendCode } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!pendingEmail) navigate('/login', { replace: true })
  }, [pendingEmail, navigate])

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN)
    intervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(intervalRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!pendingEmail || code.length < 6) return
    setError(null)
    setLoading(true)
    try {
      await verifyCode(pendingEmail, code)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.invalidCode'))
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!pendingEmail || cooldown > 0) return
    try {
      await resendCode(pendingEmail)
      startCooldown()
    } catch {
      // request-verify-code always returns 200; ignore
    }
  }

  return (
    <main className="relative min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">PlateKeeper</h1>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <div>
              <h2 className="text-xl font-semibold">{t('auth.verifyTitle')}</h2>
              <p className="text-sm text-zinc-600 mt-1">
                {t('auth.verifySubtitle', { email: pendingEmail ?? '' })}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setError(null)
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }}
                placeholder={t('auth.codePlaceholder')}
                className="px-3 py-4 text-3xl font-bold tracking-[0.5em] text-center rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label={t('auth.codePlaceholder')}
              />

              {error && <p className="text-danger text-sm text-center">{error}</p>}

              <Button
                variant="primary"
                type="submit"
                isDisabled={loading || code.length < 6}
                fullWidth
              >
                {loading ? t('auth.verifying') : t('auth.verify')}
              </Button>
            </form>

            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0}
              className="text-sm text-primary font-medium disabled:text-zinc-400 disabled:cursor-not-allowed text-center"
            >
              {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resendCode')}
            </button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
