import { useTranslation } from 'react-i18next'

const TOTAL_STEPS = 3
const STEP_NUMBERS = [1, 2, 3] as const

interface SignupProgressProps {
  step: (typeof STEP_NUMBERS)[number]
}

const SignupProgress = ({ step }: SignupProgressProps) => {
  const { t } = useTranslation()
  const label = t('auth.stepOf', { current: step, total: TOTAL_STEPS })

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
      aria-valuenow={step}
      aria-valuetext={label}
      className="flex flex-col gap-2"
    >
      <div className="flex gap-1.5" aria-hidden="true">
        {STEP_NUMBERS.map((number) => (
          <span
            key={number}
            className={`h-[5px] flex-1 rounded-full ${
              number <= step ? 'bg-carrot' : 'bg-mist-soft'
            }`}
          />
        ))}
      </div>
      <span
        aria-hidden="true"
        className="text-xs font-extrabold uppercase tracking-[.07em] text-ink-subtle"
      >
        {label}
      </span>
    </div>
  )
}

export default SignupProgress
