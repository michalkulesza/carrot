import { useTranslation } from 'react-i18next'
import { getPasswordScore, type PasswordScore } from './passwordStrength'

const SEGMENTS = [1, 2, 3, 4] as const

const SEGMENT_COLORS: Record<PasswordScore, string> = {
  0: 'bg-mist-soft',
  1: 'bg-danger',
  2: 'bg-warning',
  3: 'bg-mint-border',
  4: 'bg-mint',
}

const LABEL_COLORS: Record<PasswordScore, string> = {
  0: 'text-ink-subtle',
  1: 'text-danger',
  2: 'text-warning-700',
  3: 'text-mint-ink',
  4: 'text-mint-ink',
}

const LABEL_KEYS: Record<PasswordScore, string> = {
  0: 'auth.passwordStrength.empty',
  1: 'auth.passwordStrength.tooShort',
  2: 'auth.passwordStrength.okay',
  3: 'auth.passwordStrength.good',
  4: 'auth.passwordStrength.strong',
}

interface PasswordStrengthProps {
  password: string
}

const PasswordStrength = ({ password }: PasswordStrengthProps) => {
  const { t } = useTranslation()
  const score = getPasswordScore(password)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1 pt-0.5" aria-hidden="true">
        {SEGMENTS.map((segment) => (
          <span
            key={segment}
            className={`h-[5px] flex-1 rounded-full transition-colors ${
              segment <= score ? SEGMENT_COLORS[score] : 'bg-mist-soft'
            }`}
          />
        ))}
      </div>
      <span
        aria-live="polite"
        className={`text-[13px] font-bold ${LABEL_COLORS[score]}`}
      >
        {t(LABEL_KEYS[score])}
      </span>
    </div>
  )
}

export default PasswordStrength
