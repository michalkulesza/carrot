import type { PaletteKey } from '../../theme'
import { formatCountdown, formatDurationLabel, getRemainingSeconds, type TimerEntry } from '../../context/TimerContext'

export type TimerState = 'running' | 'paused' | 'done'

export interface TimerView {
  timer: TimerEntry
  remaining: number
  done: boolean
}

const TIMER_TONES: Record<TimerState, PaletteKey> = {
  running: 'ink',
  paused: 'textTertiary',
  done: 'actionText',
}

export const getTimerTone = (state: TimerState) => TIMER_TONES[state]

export const getTimerState = (timer: TimerEntry, done: boolean): TimerState => {
  if (done) return 'done'

  return timer.status === 'paused' ? 'paused' : 'running'
}

export const toSortedTimerViews = (timers: Iterable<TimerEntry>): TimerView[] =>
  Array.from(timers, (timer) => {
    const remaining = getRemainingSeconds(timer)

    return { timer, remaining, done: timer.status === 'done' || remaining === 0 }
  }).sort((a, b) => Number(b.done) - Number(a.done) || a.remaining - b.remaining)

export const getTimerLabel = (timer: TimerEntry) => formatDurationLabel(timer.totalSeconds)

export const getTimerProgress = (timer: TimerEntry, remaining: number) =>
  timer.totalSeconds > 0 ? remaining / timer.totalSeconds : 0

export const getTimersSummary = (views: TimerView[], doneLabel: string) =>
  views
    .map((view) => `${getTimerLabel(view.timer)} ${view.done ? doneLabel : formatCountdown(view.remaining)}`)
    .join(' · ')
