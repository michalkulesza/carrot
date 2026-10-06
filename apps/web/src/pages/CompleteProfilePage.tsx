import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/Auth/AuthLayout'
import SignupProgress from '../components/Auth/SignupProgress'
import AuthHeading from '../components/Auth/AuthHeading'
import AuthTextField from '../components/Auth/AuthTextField'
import PasswordStrength from '../components/Auth/PasswordStrength'
import { MIN_PASSWORD_LENGTH } from '../components/Auth/PasswordStrength/passwordStrength'
import AuthError from '../components/Auth/AuthError'
import AuthSubmitButton from '../components/Auth/AuthSubmitButton'

const getEmailLocalPart = (email: string | null) => email?.split('@')[0] ?? ''

const CompleteProfilePage = () => {
  const { signupEmail, signupToken, completeSignup } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const submitInProgressRef = useRef(false)

  const trimmedNickname = nickname.trim()
  const shownName = trimmedNickname || getEmailLocalPart(signupEmail)
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH

  useEffect(() => {
    if (!signupToken) navigate('/register', { replace: true })
  }, [signupToken, navigate])

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!canSubmit || submitInProgressRef.current) return

      submitInProgressRef.current = true
      setError(null)
      setLoading(true)

      try {
        await completeSignup(password, trimmedNickname || undefined)
        navigate('/', { replace: true })
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('auth.completeProfileError')
        )
      } finally {
        setLoading(false)
        submitInProgressRef.current = false
      }
    },
    [canSubmit, completeSignup, password, trimmedNickname, navigate, t]
  )

  const togglePassword = useCallback(
    () => setShowPassword((shown) => !shown),
    []
  )

  const passwordToggle = (
    <button
      type="button"
      onClick={togglePassword}
      aria-pressed={showPassword}
      className="text-[13px] font-extrabold text-carrot-strong"
    >
      {showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
    </button>
  )

  return (
    <AuthLayout>
      <SignupProgress step={3} />

      <AuthHeading
        title={t('auth.completeProfileTitle')}
        subtitle={t('auth.completeProfileSubtitle')}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-3.5">
          <AuthTextField
            id="nickname"
            type="text"
            label={t('auth.nickname')}
            labelAside={t('auth.optional')}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoComplete="nickname"
            placeholder={t('auth.nicknamePlaceholder')}
            disabled={loading}
          >
            <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-subtle">
              <span
                aria-hidden="true"
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-extrabold text-white"
              >
                {shownName.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <Trans
                  i18nKey="auth.shownAs"
                  values={{ name: shownName }}
                  components={{ bold: <b className="text-ink-soft" /> }}
                />
              </span>
            </div>
          </AuthTextField>

          <AuthTextField
            id="password"
            type={showPassword ? 'text' : 'password'}
            label={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={t('auth.passwordPlaceholder')}
            required
            disabled={loading}
            trailing={passwordToggle}
            trailingSize="text"
          >
            <PasswordStrength password={password} />
          </AuthTextField>
        </div>

        <AuthError message={error} />

        <AuthSubmitButton
          variant={canSubmit ? 'ready' : 'muted'}
          isBusy={loading}
        >
          {loading ? t('auth.creating') : t('auth.createAccount')}
        </AuthSubmitButton>
      </form>

      <p className="text-center text-xs font-semibold leading-normal text-ink-faint">
        {t('auth.termsNotice')}
      </p>
    </AuthLayout>
  )
}

export default CompleteProfilePage
