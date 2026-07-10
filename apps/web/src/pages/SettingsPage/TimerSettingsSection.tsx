import { useTranslation } from 'react-i18next'
import { Switch } from '@heroui/react'
import {
  formatCountdown,
  getRemainingSeconds,
  useTimers,
  type TimerEntry,
} from '../../context/TimerContext'
import { timerStatusColorClass, truncateStepText } from './helpers'

const TimerRow = ({
  timer,
  onPause,
  onResume,
  onCancel,
}: {
  timer: TimerEntry
  onPause: (id: string) => void
  onResume: (id: string) => void
  onCancel: (id: string) => void
}) => {
  const { t } = useTranslation()
  const remaining = getRemainingSeconds(timer)
  const statusClass = timerStatusColorClass(timer.status)

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{timer.recipeTitle}</p>
        <p className="text-xs text-zinc-400 truncate">
          {t('common.step')} {timer.stepIndex + 1}:{' '}
          {truncateStepText(timer.stepText)}
        </p>
      </div>
      <span
        className={`font-mono text-sm font-semibold tabular-nums shrink-0 ${statusClass}`}
      >
        {timer.status === 'done'
          ? t('common.doneCheck')
          : formatCountdown(remaining)}
      </span>
      <div className="flex gap-0.5 shrink-0">
        {timer.status === 'running' && (
          <button
            type="button"
            onClick={() => onPause(timer.id)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
            title={t('common.pause')}
          >
            ⏸
          </button>
        )}
        {timer.status === 'paused' && (
          <button
            type="button"
            onClick={() => onResume(timer.id)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-amber-600"
            title={t('common.resume')}
          >
            ▶
          </button>
        )}
        <button
          type="button"
          onClick={() => onCancel(timer.id)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-danger"
          title={t('common.cancel')}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

const TimerSettingsSection = () => {
  const {
    timers,
    pauseTimer,
    resumeTimer,
    cancelTimer,
    wakeLockTimersEnabled,
    setWakeLockTimersEnabled,
  } = useTimers()
  const { t } = useTranslation()
  const timerList = [...timers.values()]

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('settings.timers')}
      </h2>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-4">
        {timerList.length > 0 ? (
          <div className="flex flex-col divide-y divide-zinc-100">
            {timerList.map((timer) => (
              <TimerRow
                key={timer.id}
                timer={timer}
                onPause={pauseTimer}
                onResume={resumeTimer}
                onCancel={cancelTimer}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-400">{t('timers.noTimers')}</p>
        )}

        {'wakeLock' in navigator && (
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-100">
            <div>
              <p className="text-sm font-medium">{t('timers.keepScreenOn')}</p>
              <p className="text-xs text-zinc-400">
                {t('timers.keepScreenOnDesc')}
              </p>
            </div>
            <Switch
              size="sm"
              isSelected={wakeLockTimersEnabled}
              onChange={setWakeLockTimersEnabled}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>
        )}
      </div>
    </section>
  )
}

export default TimerSettingsSection
