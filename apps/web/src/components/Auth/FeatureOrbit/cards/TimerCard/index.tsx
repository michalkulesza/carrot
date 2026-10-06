import { useTranslation } from 'react-i18next'
import { useCycle } from '../../useCycle'
import FeatureCard from '../../FeatureCard'
import { TimerIcon } from '../../Icons'

const TOTAL_SECONDS = 300
const STATIC_ELAPSED_SECONDS = 32
const RING_LENGTH = 163.4

const formatClock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)

  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

const TimerCard = () => {
  const { t } = useTranslation()
  const elapsed = useCycle(TOTAL_SECONDS, 1000, STATIC_ELAPSED_SECONDS)
  const remaining = TOTAL_SECONDS - elapsed
  const dashOffset = RING_LENGTH * (1 - remaining / TOTAL_SECONDS)

  return (
    <FeatureCard
      label={t('auth.features.timers.label')}
      icon={<TimerIcon />}
      accentClassName="bg-red-100 text-red-800"
    >
      <div className="flex items-center gap-3.5">
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          className="shrink-0"
          aria-hidden="true"
        >
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            strokeWidth="7"
            className="stroke-mist"
          />
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={dashOffset.toFixed(1)}
            transform="rotate(-90 32 32)"
            className="stroke-carrot"
          />
        </svg>
        <div className="flex flex-col gap-0.5">
          <span className="text-2xl font-extrabold tabular-nums">
            {formatClock(remaining)}
          </span>
          <span className="text-xs font-bold text-ink-subtle">
            {t('auth.features.timers.step')}
          </span>
        </div>
      </div>
    </FeatureCard>
  )
}

export default TimerCard
