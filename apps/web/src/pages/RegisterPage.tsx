import { type FormEvent, useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/Auth/AuthLayout'
import SignupProgress from '../components/Auth/SignupProgress'
import AuthHeading from '../components/Auth/AuthHeading'
import AuthTextField from '../components/Auth/AuthTextField'
import AuthSubmitButton from '../components/Auth/AuthSubmitButton'
import AuthError from '../components/Auth/AuthError'
import OrDivider from '../components/Auth/OrDivider'
import GoogleSection from '../components/Auth/GoogleSection'
import AuthSwitchPrompt from '../components/Auth/AuthSwitchPrompt'

const ACCOUNT_EXISTS = 'ACCOUNT_EXISTS'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const RegisterPage = () => {
  const { requestSignupCode, loginWithGoogle } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const requestInProgressRef = useRef(false)
  const isValidEmail = EMAIL_PATTERN.test(email.trim())
  const isBusy = loading || googleLoading

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!isValidEmail || requestInProgressRef.current) return

      requestInProgressRef.current = true
      setError(null)
      setLoading(true)

      try {
        await requestSignupCode(email.trim())
        navigate('/verify', { replace: true })
      } catch (err) {
        const fallbackMessage =
          err instanceof Error ? err.message : t('auth.registrationError')
        const displayMessage =
          fallbackMessage === ACCOUNT_EXISTS
            ? t('auth.accountExistsError')
            : fallbackMessage || t('auth.registrationError')
        setError(displayMessage)
      } finally {
        setLoading(false)
        requestInProgressRef.current = false
      }
    },
    [email, isValidEmail, requestSignupCode, navigate, t]
  )

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      if (requestInProgressRef.current) return

      requestInProgressRef.current = true
      setError(null)
      setGoogleLoading(true)

      try {
        await loginWithGoogle(idToken)
        navigate('/', { replace: true })
      } catch {
        setError(t('auth.googleSignInError'))
      } finally {
        setGoogleLoading(false)
        requestInProgressRef.current = false
      }
    },
    [loginWithGoogle, navigate, t]
  )

  const handleGoogleError = useCallback(() => {
    setError(t('auth.googleSignInError'))
  }, [t])

  const validBadge = isValidEmail ? (
    <span
      role="img"
      aria-label={t('auth.emailLooksValid')}
      className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-mint text-xs font-extrabold text-white"
    >
      ✓
    </span>
  ) : null

  return (
    <AuthLayout>
      <SignupProgress step={1} />

      <AuthHeading
        title={t('auth.createAccount')}
        subtitle={t('auth.signupEmailSubtitle')}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <AuthTextField
          id="email"
          type="email"
          label={t('auth.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          required
          disabled={isBusy}
          tone={isValidEmail ? 'valid' : 'default'}
          trailing={validBadge}
        />

        <AuthError message={error} />

        <AuthSubmitButton
          variant={isValidEmail ? 'ready' : 'muted'}
          isBusy={isBusy}
        >
          {loading ? t('auth.sendingCode') : t('auth.continue')}
        </AuthSubmitButton>
      </form>

      <OrDivider />

      <GoogleSection
        loading={googleLoading}
        loadingLabel={t('auth.creating')}
        onCredential={handleGoogleCredential}
        onError={handleGoogleError}
      />

      <AuthSwitchPrompt
        prompt={t('auth.alreadyHaveAccount')}
        linkLabel={t('auth.signIn')}
        to="/login"
      />
    </AuthLayout>
  )
}

export default RegisterPage
