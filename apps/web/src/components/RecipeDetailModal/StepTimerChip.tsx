import { useTranslation } from 'react-i18next'
import {
  useTimers,
  getRemainingSeconds,
  formatCountdown,
  formatDurationLabel,
  type TimerEntry,
} from '../../context/TimerContext'

interface StepTimerChipProps {
  timerId: string
  totalSeconds: number
  stepText: string
  recipeId: string
  recipeTitle: string
  componentIndex: number
  stepIndex: number
  popup?: boolean
}

const StepTimerChip = ({
  timerId,
  totalSeconds,
  stepText,
  recipeId,
  recipeTitle,
  componentIndex,
  stepIndex,
  popup = false,
}: StepTimerChipProps) => {
  const { t } = useTranslation()
  const { timers, startTimer, pauseTimer, resumeTimer } = useTimers()
  const timer: TimerEntry | undefined = timers.get(timerId)

  const handleStart = () =>
    startTimer({
      id: timerId,
      recipeId,
      recipeTitle,
      componentIndex,
      stepIndex,
      stepText,
      totalSeconds,
    })

  const popupChip =
    'inline-flex items-center rounded-full bg-[#EEEAFE] px-2.5 py-1 text-[13px] font-bold text-[#5B4BC4]'

  if (!timer) {
    if (popup)
      return (
        <button type="button" onClick={handleStart} className={popupChip}>
          ⏱{' '}
          {t('recipes.startTimerLabel', {
            duration: formatDurationLabel(totalSeconds),
          })}
        </button>
      )

    return (
      <button
        type="button"
        onClick={handleStart}
        className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 hover:bg-amber-50 hover:text-amber-700 text-zinc-500 text-xs font-medium transition-colors"
        title="Start timer"
      >
        ⏱ {formatDurationLabel(totalSeconds)}
      </button>
    )
  }

  const remaining = getRemainingSeconds(timer)
  const isRunning = timer.status === 'running'

  // Show done as soon as remaining hits 0, even before the tick confirms status
  if (timer.status === 'done' || remaining === 0) {
    return (
      <span
        className={
          popup
            ? 'inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[13px] font-bold text-emerald-700'
            : 'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-xs font-medium'
        }
      >
        ✓ Done
      </span>
    )
  }

  const handleToggle = () =>
    isRunning ? pauseTimer(timerId) : resumeTimer(timerId)

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`shrink-0 inline-flex items-center gap-1 transition-colors ${
        popup
          ? 'rounded-full px-2.5 py-1 text-[13px] font-bold ' +
            (isRunning
              ? 'bg-[#FDEFE4] text-[#9A4E1C]'
              : 'bg-[#EEEAFE] text-[#5B4BC4]')
          : 'px-2 py-0.5 rounded-md text-xs font-medium font-mono ' +
            (isRunning
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              : 'bg-zinc-100 text-zinc-500 hover:bg-amber-50 hover:text-amber-700')
      }`}
      title={isRunning ? t('common.pause') : t('common.resume')}
    >
      ⏱ {formatCountdown(remaining)} {isRunning ? '⏸' : '▶'}
    </button>
  )
}

export default StepTimerChip
