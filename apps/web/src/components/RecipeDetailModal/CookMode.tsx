import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, List, Play, X } from 'react-feather'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { parseDurationMatches } from '@carrot/shared/utils/timerUtils'
import {
  getRemainingSeconds,
  formatCountdown,
  formatDurationLabel,
  useTimers,
} from '../../context/TimerContext'
import {
  buildIngredientRailRows,
  RAIL_VISIBLE_STORAGE_KEY,
  resolveRailTargets,
} from './helpers'

interface CookStep {
  componentIndex: number
  stepIndex: number
  text: string
}

const sessionKey = (recipeId: string) => `cook-mode:${recipeId}`

const RAIL_ROW_H = 34
const RAIL_VISIBLE_ROWS = 5
const RAIL_HEIGHT = RAIL_ROW_H * RAIL_VISIBLE_ROWS

const CookMode = ({
  recipe,
  onClose,
  unitSystem,
  servingScale,
}: {
  recipe: RecipeOut
  onClose: () => void
  unitSystem: string
  servingScale: number
}) => {
  const { t } = useTranslation()
  const steps = useMemo<CookStep[]>(
    () =>
      recipe.components.flatMap((component, componentIndex) =>
        component.steps.map((text, stepIndex) => ({
          componentIndex,
          stepIndex,
          text,
        }))
      ),
    [recipe]
  )
  const railRows = useMemo(
    () => buildIngredientRailRows(recipe.components, unitSystem, servingScale),
    [recipe.components, unitSystem, servingScale]
  )
  const railTargets = useMemo(
    () => resolveRailTargets(recipe.components),
    [recipe.components]
  )
  const railRef = useRef<HTMLDivElement>(null)
  const initial = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem(sessionKey(recipe.id)) ?? '{}'
      ) as { index?: number }
    } catch {
      return {}
    }
  }, [recipe.id])
  const [index, setIndex] = useState(() =>
    Math.min(initial.index ?? 0, Math.max(0, steps.length - 1))
  )
  const [railVisible, setRailVisible] = useState(
    () => localStorage.getItem(RAIL_VISIBLE_STORAGE_KEY) !== '0'
  )
  const touchStart = useRef<number | null>(null)
  const { timers, startTimer, pauseTimer, resumeTimer } = useTimers()
  const step = steps[index]
  const durations = useMemo(
    () => (step ? parseDurationMatches(step.text) : []),
    [step]
  )

  useEffect(() => {
    localStorage.setItem(sessionKey(recipe.id), JSON.stringify({ index }))
  }, [recipe.id, index])
  useEffect(() => {
    const target = railTargets[index] ?? 0
    const container = railRef.current
    if (!container || railRows.length === 0) return
    const centeredTop = target * RAIL_ROW_H - RAIL_HEIGHT / 2 + RAIL_ROW_H / 2
    container.scrollTo({
      top: Math.max(0, centeredTop),
      behavior: 'smooth',
    })
  }, [index, railTargets, railRows.length])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1))
      if (event.key === 'ArrowRight')
        setIndex((value) => Math.min(steps.length - 1, value + 1))
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', keydown)

    return () => window.removeEventListener('keydown', keydown)
  }, [onClose, steps.length])
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null
    let stale = false
    navigator.wakeLock
      ?.request('screen')
      .then((value) => {
        if (stale) void value.release()
        else sentinel = value
      })
      .catch(() => {})

    return () => {
      stale = true
      void sentinel?.release()
    }
  }, [])

  if (!step) return null
  const go = (next: number) =>
    setIndex(Math.max(0, Math.min(steps.length - 1, next)))
  const timerId = (durationIndex: number) =>
    `${recipe.id}-c${step.componentIndex}-s${step.stepIndex}-d${durationIndex}`
  const toggleRail = () => {
    setRailVisible((current) => {
      const next = !current
      localStorage.setItem(RAIL_VISIBLE_STORAGE_KEY, next ? '1' : '0')

      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-[100] select-none overflow-y-auto bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return
        const delta = e.changedTouches[0].clientX - touchStart.current
        if (Math.abs(delta) > 70) go(index + (delta < 0 ? 1 : -1))
        touchStart.current = null
      }}
    >
      <div className="mx-auto flex min-h-full max-w-4xl flex-col px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10">
        <header className="flex items-center gap-3">
          {recipe.thumbnail_url ? (
            <img
              src={recipe.thumbnail_url}
              alt=""
              className="h-11 w-11 rounded-xl object-cover"
            />
          ) : (
            <div className="h-11 w-11 rounded-xl bg-zinc-200 dark:bg-zinc-700" />
          )}
          <div className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={toggleRail}
            aria-pressed={railVisible}
            className={`rounded-full p-3 hover:bg-black/5 dark:hover:bg-white/10 ${railVisible ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-600'}`}
            aria-label={t('cookMode.toggleIngredientRail')}
          >
            <List size={22} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-3 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close cook mode"
          >
            <X />
          </button>
        </header>
        <div
          className="flex gap-1.5"
          aria-label={`Step ${index + 1} of ${steps.length}`}
        >
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-300 dark:bg-zinc-700'}`}
            />
          ))}
        </div>
        <main className="flex flex-1 flex-col items-center py-10 text-center">
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Step {index + 1}
            </p>
            <p className="max-w-3xl font-serif text-4xl leading-tight sm:text-6xl">
              {step.text}
            </p>
          </div>
          {durations.length > 0 && (
            <div className="mt-7 flex w-full max-w-2xl items-start gap-2 overflow-x-auto">
              {durations.map((duration, durationIndex) => {
                const id = timerId(durationIndex)
                const timer = timers.get(id)
                const remaining = timer
                  ? getRemainingSeconds(timer)
                  : duration.seconds
                const running = timer?.status === 'running'
                const done = timer?.status === 'done' || remaining === 0

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      !timer
                        ? startTimer({
                            id,
                            recipeId: recipe.id,
                            recipeTitle: recipe.title,
                            componentIndex: step.componentIndex,
                            stepIndex: step.stepIndex,
                            stepText: step.text,
                            totalSeconds: duration.seconds,
                          })
                        : !done && (running ? pauseTimer(id) : resumeTimer(id))
                    }
                    className="flex-shrink-0 rounded-2xl border border-zinc-200 bg-white/80 p-3 text-left shadow-sm transition hover:scale-[1.01] dark:border-zinc-700 dark:bg-zinc-800/80"
                  >
                    <span className="flex items-center gap-1 text-xs font-medium text-zinc-500">
                      <Clock size={11} />{' '}
                      {done
                        ? 'Done'
                        : timer
                          ? running
                            ? 'Tap to pause'
                            : 'Tap to resume'
                          : 'Ready to start'}
                    </span>
                    <span className="mt-1 block font-serif text-4xl tabular-nums">
                      {timer
                        ? formatCountdown(remaining)
                        : formatDurationLabel(duration.seconds)}
                    </span>
                    {!timer && (
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        <Play size={10} /> Start timer
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          {railVisible && railRows.length > 0 && (
            <div
              ref={railRef}
              className="relative mt-6 mb-3 w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-300/40 px-3.5 dark:border-zinc-600/40"
              style={{
                height: RAIL_HEIGHT,
                maskImage:
                  'linear-gradient(to bottom, transparent, black 26px, black calc(100% - 26px), transparent)',
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent, black 26px, black calc(100% - 26px), transparent)',
              }}
            >
              {railRows.map((row) =>
                row.kind === 'header' ? (
                  <div
                    key={row.key}
                    className="flex items-center truncate text-xs font-semibold uppercase tracking-wide text-zinc-500"
                    style={{ height: RAIL_ROW_H }}
                  >
                    {row.text}
                  </div>
                ) : (
                  <div
                    key={row.key}
                    className="flex items-center truncate text-base text-zinc-800 dark:text-zinc-200"
                    style={{ height: RAIL_ROW_H }}
                  >
                    {row.text}
                  </div>
                )
              )}
            </div>
          )}
        </main>
        <footer className="flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => go(index - 1)}
            className="grid h-14 w-14 cursor-pointer place-items-center rounded-full bg-zinc-200/70 text-zinc-700 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <ChevronLeft />
          </button>
          <p className="text-lg font-semibold">
            {index + 1} of {steps.length}
          </p>
          <button
            type="button"
            disabled={index === steps.length - 1}
            onClick={() => go(index + 1)}
            className="grid h-14 w-14 cursor-pointer place-items-center rounded-full bg-zinc-900 text-white disabled:cursor-not-allowed disabled:opacity-35 dark:bg-zinc-100 dark:text-zinc-900"
          >
            <ChevronRight />
          </button>
        </footer>
      </div>
    </div>
  )
}

export default CookMode
