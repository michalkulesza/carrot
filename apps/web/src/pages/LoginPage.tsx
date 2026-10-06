import { type FormEvent, useCallback, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/Auth/AuthLayout'
import AuthHeading from '../components/Auth/AuthHeading'
import AuthTextField from '../components/Auth/AuthTextField'
import AuthSubmitButton from '../components/Auth/AuthSubmitButton'
import AuthError from '../components/Auth/AuthError'
import OrDivider from '../components/Auth/OrDivider'
import GoogleSection from '../components/Auth/GoogleSection'
import AuthSwitchPrompt from '../components/Auth/AuthSwitchPrompt'
import { isSafeReturnPath } from '../routing/routeState'

const LoginPage = () => {
  const { login, loginWithGoogle } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextCandidate = searchParams.get('next')
  const nextPath = isSafeReturnPath(nextCandidate) ? nextCandidate : '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const signInInProgressRef = useRef(false)
  const isSigningIn = loading || googleLoading

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!email || !password || signInInProgressRef.current) return

      signInInProgressRef.current = true
      setError(null)
      setLoading(true)

      try {
        await login(email, password)
        navigate(nextPath, { replace: true })
      } catch (err) {
        const fallbackMessage =
          err instanceof Error ? err.message : t('auth.loginFailed')
        const displayMessage =
          fallbackMessage === 'LOGIN_USER_NOT_VERIFIED'
            ? t('auth.notVerifiedError')
            : fallbackMessage
        setError(displayMessage)
      } finally {
        setLoading(false)
        signInInProgressRef.current = false
      }
    },
    [email, password, login, navigate, nextPath, t]
  )

  const handleGoogleCredential = useCallback(
    async (idToken: string) => {
      if (signInInProgressRef.current) return

      signInInProgressRef.current = true
      setError(null)
      setGoogleLoading(true)

      try {
        await loginWithGoogle(idToken)
        navigate(nextPath, { replace: true })
      } catch {
        setError(t('auth.googleSignInError'))
      } finally {
        setGoogleLoading(false)
        signInInProgressRef.current = false
      }
    },
    [loginWithGoogle, navigate, nextPath, t]
  )

  const handleGoogleError = useCallback(() => {
    setError(t('auth.googleSignInError'))
  }, [t])

  return (
    <AuthLayout>
      <AuthHeading title={t('auth.welcomeBack')} subtitle={t('auth.tagline')} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-3.5">
          <AuthTextField
            id="email"
            type="email"
            label={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            disabled={isSigningIn}
          />
          <AuthTextField
            id="password"
            type="password"
            label={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={isSigningIn}
          />
        </div>

        <AuthError message={error} />

        <AuthSubmitButton variant="ready" isBusy={isSigningIn}>
          {isSigningIn ? t('auth.signingIn') : t('auth.signIn')}
        </AuthSubmitButton>
      </form>

      <OrDivider />

      <GoogleSection
        loading={isSigningIn}
        loadingLabel={t('auth.signingIn')}
        onCredential={handleGoogleCredential}
        onError={handleGoogleError}
      />

      <AuthSwitchPrompt
        prompt={t('auth.noAccount')}
        linkLabel={t('auth.createOne')}
        to="/register"
      />
    </AuthLayout>
  )
}

export default LoginPage
