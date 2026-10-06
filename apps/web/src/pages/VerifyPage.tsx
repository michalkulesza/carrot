import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import AuthLayout from '../components/Auth/AuthLayout'
import SignupProgress from '../components/Auth/SignupProgress'
import MailTile from '../components/Auth/MailTile'
import AuthHeading from '../components/Auth/AuthHeading'
import OtpInput from '../components/Auth/OtpInput'
import AuthError from '../components/Auth/AuthError'
import AuthSubmitButton from '../components/Auth/AuthSubmitButton'

const CODE_LENGTH = 6
const RESEND_COOLDOWN_MS = 60_000

const ERROR_KEYS: Record<string, string> = {
  SIGNUP_CODE_INVALID: 'auth.codeInvalid',
  SIGNUP_CODE_EXPIRED: 'auth.codeExpired',
  SIGNUP_CODE_TOO_MANY_ATTEMPTS: 'auth.codeTooManyAttempts',
}

const VerifyPage = () => {
  const { signupEmail, verifySignupCode, requestSignupCode } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  // A code was just sent on the previous screen, so the cooldown starts now.
  const [resendAvailableAt, setResendAvailableAt] = useState(
    () => Date.now() + RESEND_COOLDOWN_MS
  )
  const [now, setNow] = useState(() => Date.now())
  const [resending, setResending] = useState(false)
  const verifyInProgressRef = useRef(false)
  const resendInProgressRef = useRef(false)

  const secondsLeft = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000))
  const isCodeComplete = code.length === CODE_LENGTH

  useEffect(() => {
    if (!signupEmail) navigate('/register', { replace: true })
  }, [signupEmail, navigate])

  useEffect(() => {
    const intervalId = setInterval(() => {
      const current = Date.now()

      setNow(current)
      if (current >= resendAvailableAt) clearInterval(intervalId)
    }, 1000)

    return () => clearInterval(intervalId)
  }, [resendAvailableAt])

  const handleCodeChange = useCallback((value: string) => {
    setError(null)
    setCode(value)
  }, [])

  const handleVerify = useCallback(async () => {
    if (!signupEmail || !isCodeComplete || verifyInProgressRef.current) return

    verifyInProgressRef.current = true
    setError(null)
    setLoading(true)

    try {
      await verifySignupCode(signupEmail, code)
      setIsVerified(true)
      navigate('/complete-profile', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(t(ERROR_KEYS[msg] ?? 'auth.invalidCode'))
      setCode('')
    } finally {
      setLoading(false)
      verifyInProgressRef.current = false
    }
  }, [signupEmail, isCodeComplete, code, verifySignupCode, navigate, t])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      void handleVerify()
    },
    [handleVerify]
  )

  const handleResend = useCallback(async () => {
    if (!signupEmail || secondsLeft > 0 || resendInProgressRef.current) return

    resendInProgressRef.current = true
    setError(null)
    setResending(true)

    try {
      await requestSignupCode(signupEmail)
      setCode('')
      setNow(Date.now())
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS)
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t('auth.registrationError')
      )
    } finally {
      setResending(false)
      resendInProgressRef.current = false
    }
  }, [signupEmail, secondsLeft, requestSignupCode, t])

  const handleChangeEmail = useCallback(() => {
    navigate('/register')
  }, [navigate])

  const canResend = secondsLeft === 0 && !resending
  const otpState = isVerified ? 'verified' : error ? 'error' : 'default'

  let submitVariant: 'ready' | 'muted' | 'success' = 'muted'
  if (isVerified) submitVariant = 'success'
  else if (isCodeComplete) submitVariant = 'ready'

  return (
    <AuthLayout>
      <SignupProgress step={2} />

      <MailTile />

      <AuthHeading
        title={t('auth.verifyTitle')}
        subtitle={t('auth.codeSentTo')}
      >
        <div className="flex flex-wrap items-baseline gap-x-2 text-[15px] leading-[1.45]">
          <b className="min-w-0 break-all font-extrabold text-ink">
            {signupEmail ?? ''}
          </b>
          <button
            type="button"
            onClick={handleChangeEmail}
            className="font-extrabold text-carrot-strong"
          >
            {t('auth.changeEmail')}
          </button>
        </div>
      </AuthHeading>

      <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
        <OtpInput
          value={code}
          onChange={handleCodeChange}
          onSubmit={handleVerify}
          disabled={loading || isVerified}
          state={otpState}
        />

        <AuthError message={error} />

        <AuthSubmitButton variant={submitVariant} isBusy={loading}>
          {loading ? t('auth.verifying') : t('auth.verify')}
        </AuthSubmitButton>
      </form>

      <div className="flex items-center justify-between gap-3 text-sm font-semibold text-ink-subtle">
        <span>{t('auth.checkSpam')}</span>
        <button
          type="button"
          onClick={handleResend}
          aria-disabled={!canResend}
          className={`font-extrabold tabular-nums ${
            canResend ? 'text-carrot-strong' : 'cursor-default text-ink-faint'
          }`}
        >
          {secondsLeft > 0
            ? t('auth.resendIn', { seconds: secondsLeft })
            : t('auth.resendCode')}
        </button>
      </div>
    </AuthLayout>
  )
}

export default VerifyPage
