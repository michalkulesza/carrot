import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, List, Play, X } from 'react-feather'
import type { RecipeOut } from '@carrot/shared/types'
import { displayIngredient } from '@carrot/shared/utils/ingredientUtils'
import { parseDurationMatches } from '@carrot/shared/utils/timerUtils'
import {
  getRemainingSeconds,
  formatCountdown,
  formatDurationLabel,
  useTimers,
} from '../../context/TimerContext'

interface CookStep {
  componentIndex: number
  stepIndex: number
  text: string
  ingredients: string[]
}

const sessionKey = (recipeId: string) => `cook-mode:${recipeId}`

const CookMode = ({
  recipe,
  onClose,
}: {
  recipe: RecipeOut
  onClose: () => void
}) => {
  const steps = useMemo<CookStep[]>(
    () =>
      recipe.components.flatMap((component, componentIndex) =>
        component.steps.map((text, stepIndex) => ({
          componentIndex,
          stepIndex,
          text,
          ingredients: [
            ...new Set(
              (component.step_ingredient_refs?.[stepIndex] ?? []).map((ref) =>
                displayIngredient(
                  ref.display ?? component.ingredients[ref.ingredient_index] ?? ''
                )
              )
            ),
          ],
        }))
      ),
    [recipe]
  )
  const initial = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem(sessionKey(recipe.id)) ?? '{}'
      ) as { index?: number; checked?: string[] }
    } catch {
      return {}
    }
  }, [recipe.id])
  const [index, setIndex] = useState(() =>
    Math.min(initial.index ?? 0, Math.max(0, steps.length - 1))
  )
  const [checked, setChecked] = useState(() => new Set(initial.checked ?? []))
  const [ingredientsOpen, setIngredientsOpen] = useState(false)
  const touchStart = useRef<number | null>(null)
  const { timers, startTimer, pauseTimer, resumeTimer } = useTimers()
  const step = steps[index]
  const durations = useMemo(
    () => (step ? parseDurationMatches(step.text) : []),
    [step]
  )

  useEffect(() => {
    localStorage.setItem(
      sessionKey(recipe.id),
      JSON.stringify({ index, checked: [...checked] })
    )
  }, [recipe.id, index, checked])
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
  const allIngredients = recipe.components.flatMap(
    (component, componentIndex) =>
      component.ingredients.map((ingredient, ingredientIndex) => ({
        key: `${componentIndex}-${ingredientIndex}`,
        text: displayIngredient(ingredient),
      }))
  )
  const go = (next: number) =>
    setIndex(Math.max(0, Math.min(steps.length - 1, next)))
  const timerId = (durationIndex: number) =>
    `${recipe.id}-c${step.componentIndex}-s${step.stepIndex}-d${durationIndex}`

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
          <p className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">
            {recipe.title}
          </p>
          <button
            type="button"
            onClick={() => setIngredientsOpen(true)}
            className="rounded-full p-3 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Ingredients"
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
          className="mt-8 flex gap-1.5"
          aria-label={`Step ${index + 1} of ${steps.length}`}
        >
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-300 dark:bg-zinc-700'}`}
            />
          ))}
        </div>
        <main className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Step {index + 1}
          </p>
          <p className="max-w-3xl font-serif text-4xl leading-tight sm:text-6xl">
            {step.text}
          </p>
          {step.ingredients.length > 0 && (
            <p className="mt-7 max-w-xl text-base text-zinc-500">
              {step.ingredients.join(' · ')}
            </p>
          )}
          {durations.length > 0 && (
            <div className="mt-10 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
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
                    className="rounded-3xl border border-zinc-200 bg-white/80 p-5 text-left shadow-sm transition hover:scale-[1.01] dark:border-zinc-700 dark:bg-zinc-800/80"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-500">
                      <Clock size={16} />{' '}
                      {done
                        ? 'Done'
                        : timer
                          ? running
                            ? 'Tap to pause'
                            : 'Tap to resume'
                          : 'Ready to start'}
                    </span>
                    <span className="mt-2 block font-serif text-5xl tabular-nums">
                      {timer
                        ? formatCountdown(remaining)
                        : formatDurationLabel(duration.seconds)}
                    </span>
                    {!timer && (
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                        <Play size={15} /> Start timer
                      </span>
                    )}
                  </button>
                )
              })}
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
      {ingredientsOpen && (
        <div
          className="fixed inset-0 z-10 flex items-end bg-black/40 sm:items-center sm:justify-center"
          onClick={() => setIngredientsOpen(false)}
        >
          <section
            className="max-h-[75vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 text-zinc-900 sm:max-w-lg sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-zinc-900">
                Ingredients
              </h2>
              <button
                type="button"
                onClick={() => setIngredientsOpen(false)}
                aria-label="Close ingredients"
                className="rounded-full p-2 text-zinc-600 hover:bg-black/5"
              >
                <X />
              </button>
            </div>
            {allIngredients.map((ingredient) => (
              <label
                key={ingredient.key}
                className="flex cursor-pointer items-center gap-3 py-3 text-zinc-900"
              >
                <input
                  type="checkbox"
                  checked={checked.has(ingredient.key)}
                  onChange={() =>
                    setChecked((current) => {
                      const next = new Set(current)
                      next.has(ingredient.key)
                        ? next.delete(ingredient.key)
                        : next.add(ingredient.key)
                      return next
                    })
                  }
                  className="h-5 w-5 cursor-pointer rounded border-zinc-400 accent-primary"
                />
                <span
                  className={
                    checked.has(ingredient.key)
                      ? 'text-zinc-400 line-through'
                      : ''
                  }
                >
                  {ingredient.text}
                </span>
              </label>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}

export default CookMode
