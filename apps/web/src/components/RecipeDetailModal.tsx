import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, ShoppingCart, Sun } from 'react-feather'
import { useTranslation } from 'react-i18next'
import { useShoppingList } from '@platekeeper/shared/hooks/useShoppingList'
import {
  useTimers,
  getRemainingSeconds,
  parseDurationMatch,
  formatCountdown,
  formatDurationLabel,
  type TimerEntry,
} from '../context/TimerContext'
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Switch,
  toast,
} from '@heroui/react'
import type {
  AllergenFlag,
  RecipeOut,
  SaveComponent,
  StepIngredientRef,
  Tag,
} from '@platekeeper/shared/types'
import {
  UNITS,
  addTagToRecipe,
  createTag,
  deleteRecipe,
  removeTagFromRecipe,
  updateRecipe,
  uploadThumbnail,
} from '../api/client'
import TagRow from './TagRow'
import { proxyUrl, PLACEHOLDER_URL } from '../utils/imageUtils'
import { useDebugMode } from '../context/DebugModeContext'

// ── Allergen popover ──────────────────────────────────────────────────────────

const AllergenPopover = ({
  flag,
  activeAllergens,
  onReplace,
  onRestore,
}: {
  flag: AllergenFlag
  activeAllergens: string[]
  onReplace: () => void
  onRestore: () => void
}) => {
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(false)
  const [pos, setPos] = useState({ vertical: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      )
        setOpen(false)
    }
    const handleScroll = () => {
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, { capture: true })

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, { capture: true })
    }
  }, [open])

  const isActive =
    flag.allergen &&
    activeAllergens.some((a) => {
      const fa = flag.allergen!.toLowerCase()
      const la = a.toLowerCase()

      return fa === la || fa.includes(la) || la.includes(fa)
    })
  if (!isActive) return null

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const showAbove = r.top > window.innerHeight / 2
      setAbove(showAbove)
      setPos({
        vertical: showAbove ? window.innerHeight - r.top + 4 : r.bottom + 4,
        right: window.innerWidth - r.right,
      })
    }
    setOpen((v) => !v)
  }

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    right: pos.right,
    zIndex: 9999,
    ...(above ? { bottom: pos.vertical } : { top: pos.vertical }),
  }

  const { t } = useTranslation()

  return (
    <div className="shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap ${
          flag.substitute_applied
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
        }`}
        title={
          flag.substitute_applied
            ? t('recipes.substituteApplied')
            : t('recipes.contains') + ' ' + flag.allergen
        }
      >
        {flag.substitute_applied ? '✓' : `⚠ ${flag.allergen}`}
      </button>
      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="bg-white border border-zinc-200 rounded-xl shadow-lg p-3 min-w-[220px] max-w-[330px] text-sm"
        >
          {flag.substitute_applied && flag.original_display ? (
            <>
              <p className="text-zinc-600 mb-2">
                {t('recipes.originally')}{' '}
                <strong className="text-zinc-800">
                  {flag.original_display}
                </strong>
                , {t('recipes.replacedWith')}{' '}
                <strong className="text-zinc-800">{flag.substitute}</strong>{' '}
                {t('recipes.dueTo')} {flag.allergen}.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  onRestore()
                  setOpen(false)
                }}
              >
                {t('recipes.restoreOriginal')}
              </Button>
            </>
          ) : flag.substitute ? (
            <>
              <p className="text-zinc-600 mb-2">
                {t('recipes.contains')}{' '}
                <strong className="text-zinc-800">{flag.allergen}</strong>.{' '}
                {t('recipes.suggestedSubstitute')}{' '}
                <strong className="text-zinc-800">{flag.substitute}</strong>.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onPress={() => {
                    onReplace()
                    setOpen(false)
                  }}
                >
                  {t('recipes.replace')}
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => setOpen(false)}
                >
                  {t('recipes.keepOriginal')}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-zinc-600">
              {t('recipes.contains')}{' '}
              <strong className="text-zinc-800">{flag.allergen}</strong>.{' '}
              {t('recipes.noSubstituteAvailable')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── EditLine ──────────────────────────────────────────────────────────────────

const EditLine = ({
  value,
  onChange,
  className = '',
  multiline = false,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  multiline?: boolean
}) => {
  const base =
    'w-full bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-primary focus:outline-none transition-colors resize-none'
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = `${ref.current.scrollHeight}px`
    }
  }, [value])

  if (multiline) {
    return (
      <textarea
        ref={ref}
        value={value}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        className={`${base} overflow-hidden ${className}`}
      />
    )
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${base} ${className}`}
    />
  )
}

// ── Structured ingredient helpers ────────────────────────────────────────────

interface StructuredIngredient {
  qty: string
  unit: string
  name: string
  note: string
}

const parseIngredient = (s: string): StructuredIngredient => {
  const trimmed = s.trim()
  if (!trimmed) return { qty: '', unit: '', name: '', note: '' }
  let rest = trimmed
  let note = ''
  const noteMatch = rest.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (noteMatch) {
    rest = noteMatch[1].trim()
    note = noteMatch[2]
  }
  const parts = rest.split(/\s+/)
  let idx = 0
  let qty = ''
  if (parts[idx] && /^[\d¼½¾⅓⅔⅛⅜⅝⅞.,/]+$/.test(parts[idx])) {
    qty = parts[idx++]
  }
  let unit = ''
  if (parts[idx] && (UNITS as readonly string[]).includes(parts[idx].toLowerCase())) {
    unit = parts[idx++].toLowerCase()
  }
  return { qty, unit, name: parts.slice(idx).join(' '), note }
}

const serializeIngredient = (ing: StructuredIngredient): string => {
  return [ing.qty, ing.unit, ing.name, ing.note ? `(${ing.note})` : '']
    .filter(Boolean)
    .join(' ')
}

const displayIngredient = (s: string, t: (key: string, opts: { defaultValue: string }) => string): string => {
  const parsed = parseIngredient(s)
  if (!parsed.unit) return s
  return serializeIngredient({ ...parsed, unit: t(`units.${parsed.unit}`, { defaultValue: parsed.unit }) })
}

// Note is intentionally dropped — shopping list entries are qty/unit/name only.
const formatForShoppingList = (s: string): string => {
  const { qty, unit, name } = parseIngredient(s)
  return [qty, unit, name].filter(Boolean).join(' ')
}

const IngredientEditor = ({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) => {
  const { t } = useTranslation()
  const [parts, setParts] = useState<StructuredIngredient>(() => parseIngredient(value))
  const inputBase =
    'bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-primary focus:outline-none transition-colors text-sm'

  const update = (field: keyof StructuredIngredient, val: string) => {
    const next = { ...parts, [field]: val }
    setParts(next)
    onChange(serializeIngredient(next))
  }

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <input
        type="text"
        value={parts.qty}
        onChange={(e) => update('qty', e.target.value)}
        placeholder={t('units.qtyLabel')}
        aria-label={t('units.qtyLabel')}
        className={`${inputBase} w-10 text-center shrink-0`}
      />
      <select
        value={parts.unit}
        onChange={(e) => update('unit', e.target.value)}
        aria-label={t('units.unitLabel')}
        className={`${inputBase} shrink-0 cursor-pointer text-zinc-500 max-w-[7rem]`}
      >
        <option value="">—</option>
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {t(`units.${u}`)}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={parts.name}
        onChange={(e) => update('name', e.target.value)}
        aria-label="ingredient name"
        className={`${inputBase} flex-1 min-w-0`}
      />
      <input
        type="text"
        value={parts.note}
        onChange={(e) => update('note', e.target.value)}
        placeholder={t('units.noteLabel')}
        aria-label={t('units.noteLabel')}
        className={`${inputBase} w-16 text-zinc-400 italic shrink-0`}
      />
    </div>
  )
}

// ── Screen Wake Lock hook ─────────────────────────────────────────────────────

const useScreenWakeLock = () => {
  const [active, setActive] = useState(
    () => localStorage.getItem('wakelock-default') === '1'
  )
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) {
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null

      return
    }

    let stale = false
    navigator.wakeLock
      ?.request('screen')
      .then((s) => {
        if (stale) {
          s.release()

          return
        }
        sentinelRef.current = s
      })
      .catch(() => {})

    return () => {
      stale = true
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null
    }
  }, [active])

  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        active &&
        !sentinelRef.current
      ) {
        navigator.wakeLock
          ?.request('screen')
          .then((s) => {
            sentinelRef.current = s
          })
          .catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [active])

  return {
    active,
    toggle: () => setActive((v) => !v),
    release: () => setActive(false),
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'view' | 'editing' | 'confirming'

interface EditState {
  title: string
  servings: string
  kcal: string
  thumbnail_url: string | null
  components: SaveComponent[]
  shared_to_personal: boolean
}

const toEditState = (r: RecipeOut): EditState => {
  return {
    title: r.title,
    servings: r.servings?.toString() ?? '',
    kcal: r.kcal_per_serving?.toString() ?? '',
    thumbnail_url: r.thumbnail_url,
    components: (r.components as SaveComponent[]).map((c) => ({
      ...c,
      ingredients: [...c.ingredients],
      steps: [...c.steps],
      ingredient_flags: c.ingredient_flags
        ? [...c.ingredient_flags]
        : undefined,
    })),
    shared_to_personal: r.shared_to_personal ?? true,
  }
}

// ── Step timer chip ───────────────────────────────────────────────────────────

const StepTimerChip = ({
  timerId,
  totalSeconds,
  stepText,
  recipeId,
  recipeTitle,
  componentIndex,
  stepIndex,
}: {
  timerId: string
  totalSeconds: number
  stepText: string
  recipeId: string
  recipeTitle: string
  componentIndex: number
  stepIndex: number
}) => {
  const { timers, startTimer, pauseTimer, resumeTimer } = useTimers()
  const timer: TimerEntry | undefined = timers.get(timerId)

  if (!timer) {
    return (
      <button
        type="button"
        onClick={() =>
          startTimer({
            id: timerId,
            recipeId,
            recipeTitle,
            componentIndex,
            stepIndex,
            stepText,
            totalSeconds,
          })
        }
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
      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-xs font-medium">
        ✓ Done
      </span>
    )
  }

  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={() => (isRunning ? pauseTimer(timerId) : resumeTimer(timerId))}
      className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium font-mono transition-colors ${
        isRunning
          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          : 'bg-zinc-100 text-zinc-500 hover:bg-amber-50 hover:text-amber-700'
      }`}
      title={isRunning ? t('common.pause') : t('common.resume')}
    >
      ⏱ {formatCountdown(remaining)} {isRunning ? '⏸' : '▶'}
    </button>
  )
}

// ── Ingredient pill ───────────────────────────────────────────────────────────

const IngredientPill = ({
  mention,
  ingredientText,
}: {
  mention: string
  ingredientText: string
}) => {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const showAbove = r.top > window.innerHeight / 2
      setPos({
        top: showAbove ? r.top - 4 : r.bottom + 4,
        left: r.left,
      })
    }
    setOpen((v) => !v)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        aria-label={ingredientText}
        className="inline-flex items-center bg-blue-50 text-blue-700 rounded-md px-2 py-0.5 text-xs font-medium cursor-pointer hover:bg-blue-100 transition-colors"
      >
        {mention}
      </button>
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 9999,
            transform: pos.top < window.innerHeight / 2 ? 'none' : 'translateY(-100%)',
          }}
          className="bg-white border border-zinc-200 rounded-xl shadow-lg p-3 text-sm max-w-[260px]"
        >
          {ingredientText}
        </div>
      )}
    </>
  )
}

// ── Step text with inline pills ───────────────────────────────────────────────

const StepText = ({
  step,
  stepRefs,
  ingredients,
  timerId,
  recipeId,
  recipeTitle,
  componentIndex,
  stepIndex,
}: {
  step: string
  stepRefs: StepIngredientRef[]
  ingredients: string[]
  timerId: string
  recipeId: string
  recipeTitle: string
  componentIndex: number
  stepIndex: number
}) => {
  const { t } = useTranslation()

  interface Span {
    start: number
    end: number
    kind: 'timer' | 'ingredient'
    seconds?: number
    mention?: string
    ingredientIndex?: number
    key: string
  }

  const spans: Span[] = []

  const timerMatch = parseDurationMatch(step)
  if (timerMatch) {
    spans.push({ start: timerMatch.start, end: timerMatch.end, kind: 'timer', seconds: timerMatch.seconds, key: `t${timerMatch.start}` })
  }

  for (const ref of stepRefs) {
    let idx = 0
    while (true) {
      const pos = step.indexOf(ref.mention, idx)
      if (pos === -1) break
      spans.push({ start: pos, end: pos + ref.mention.length, kind: 'ingredient', mention: ref.mention, ingredientIndex: ref.ingredient_index, key: `i${pos}-${ref.ingredient_index}` })
      idx = pos + ref.mention.length
    }
  }

  spans.sort((a, b) => a.start - b.start)

  const filtered: Span[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start >= cursor) {
      filtered.push(span)
      cursor = span.end
    }
  }

  const nodes: React.ReactNode[] = []
  let pos = 0
  for (const span of filtered) {
    if (pos < span.start) nodes.push(step.slice(pos, span.start))
    if (span.kind === 'timer') {
      nodes.push(
        <StepTimerChip
          key={span.key}
          timerId={timerId}
          totalSeconds={span.seconds!}
          stepText={step}
          recipeId={recipeId}
          recipeTitle={recipeTitle}
          componentIndex={componentIndex}
          stepIndex={stepIndex}
        />
      )
    } else {
      const ingText = displayIngredient(ingredients[span.ingredientIndex!] ?? '', t)
      nodes.push(
        <IngredientPill
          key={span.key}
          mention={span.mention!}
          ingredientText={ingText}
        />
      )
    }
    pos = span.end
  }
  if (pos < step.length) nodes.push(step.slice(pos))

  return <span className="flex-1">{nodes}</span>
}

// ── View: component section ───────────────────────────────────────────────────

const ViewComponent = ({
  comp,
  single,
  activeAllergens,
  onReplaceIngredient,
  onRestoreIngredient,
  recipeId,
  recipeTitle,
  componentIndex,
  addMode = false,
  sessionAdded,
  onAddIngredient,
  onAddAllIngredients,
}: {
  comp: SaveComponent
  single: boolean
  activeAllergens: string[]
  onReplaceIngredient: (ii: number) => void
  onRestoreIngredient: (ii: number) => void
  recipeId: string
  recipeTitle: string
  componentIndex: number
  addMode?: boolean
  sessionAdded?: Set<string>
  onAddIngredient?: (ii: number) => void
  onAddAllIngredients?: () => void
}) => {
  const { t } = useTranslation()

  // Client-side fallback: when AI matching wasn't run, do simple name matching
  const clientRefs = useMemo<StepIngredientRef[][] | null>(() => {
    if (comp.step_ingredient_refs != null) return null
    return comp.steps.map((step) => {
      const refs: StepIngredientRef[] = []
      const stepLower = step.toLowerCase()
      comp.ingredients.forEach((ingStr, ii) => {
        const fullName = parseIngredient(ingStr).name.split(',')[0].trim().toLowerCase()
        // Try full name first, then each individual word — handles "chicken" matching
        // "chicken thighs" and "soy" matching "filiżanka tamari soy" (non-English unit absorbed into name)
        const candidates = [fullName]
        for (const word of fullName.split(/\s+/)) {
          if (word !== fullName && word.length >= 3 && !candidates.includes(word)) candidates.push(word)
        }
        for (const searchName of candidates) {
          if (searchName.length < 3) continue
          let matched = false
          let idx = 0
          while (true) {
            const pos = stepLower.indexOf(searchName, idx)
            if (pos === -1) break
            const beforeOk = pos === 0 || !/\w/.test(stepLower[pos - 1])
            const afterOk = pos + searchName.length >= stepLower.length || !/\w/.test(stepLower[pos + searchName.length])
            if (beforeOk && afterOk) {
              refs.push({ ingredient_index: ii, mention: step.slice(pos, pos + searchName.length) })
              matched = true
            }
            idx = pos + searchName.length
          }
          if (matched) break
        }
      })
      return refs
    })
  }, [comp.step_ingredient_refs, comp.ingredients, comp.steps])

  return (
    <div className="mb-5">
      {!single && (
        <h3 className="text-sm font-semibold text-zinc-600 mb-2">
          {comp.name}
        </h3>
      )}
      {comp.ingredients.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold uppercase text-zinc-400">
              {t('recipes.sectionIngredients')}
            </p>
            {addMode &&
              (() => {
                const allAdded = comp.ingredients.every((_, i) =>
                  sessionAdded?.has(`${componentIndex}-${i}`)
                )

                return (
                  <button
                    type="button"
                    onClick={onAddAllIngredients}
                    disabled={allAdded}
                    className="text-xs font-medium text-primary hover:underline disabled:text-zinc-300 disabled:no-underline"
                  >
                    {allAdded
                      ? t('shoppingList.addedToList')
                      : t('shoppingList.addAll')}
                  </button>
                )
              })()}
          </div>
          <ul className="space-y-1 mb-3">
            {comp.ingredients.map((ing, i) => {
              const flag = comp.ingredient_flags?.[i]
              const added = sessionAdded?.has(`${componentIndex}-${i}`) ?? false

              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-zinc-300 mt-1 shrink-0">·</span>
                  <span className="flex-1">{displayIngredient(ing, t)}</span>
                  {flag && (
                    <AllergenPopover
                      flag={flag}
                      activeAllergens={activeAllergens}
                      onReplace={() => onReplaceIngredient(i)}
                      onRestore={() => onRestoreIngredient(i)}
                    />
                  )}
                  {addMode && (
                    <button
                      type="button"
                      onClick={added ? undefined : () => onAddIngredient?.(i)}
                      aria-label={
                        added
                          ? t('shoppingList.addedToList')
                          : t('shoppingList.addToList')
                      }
                      className={`shrink-0 mt-0.5 ${added ? 'text-emerald-500' : 'text-primary hover:text-primary-600'}`}
                    >
                      {added ? (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      )}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
      {comp.steps.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
            {t('recipes.steps')}
          </p>
          <ol className="space-y-2">
            {comp.steps.map((step, i) => {
              const timerId = `${recipeId}-c${componentIndex}-s${i}`
              const stepRefs = comp.step_ingredient_refs?.[i] ?? clientRefs?.[i] ?? []

              return (
                <li
                  key={i}
                  id={`timer-step-${componentIndex}-${i}`}
                  className="flex items-start gap-2 text-sm transition-colors duration-300"
                >
                  <span className="text-zinc-400 font-medium shrink-0">
                    {i + 1}.
                  </span>
                  <StepText
                    step={step}
                    stepRefs={stepRefs}
                    ingredients={comp.ingredients}
                    timerId={timerId}
                    recipeId={recipeId}
                    recipeTitle={recipeTitle}
                    componentIndex={componentIndex}
                    stepIndex={i}
                  />
                </li>
              )
            })}
          </ol>
        </>
      )}
    </div>
  )
}

// ── Edit: component section ───────────────────────────────────────────────────

const EditComponent = ({
  comp,
  single,
  onIngredientChange,
  onStepChange,
}: {
  comp: SaveComponent
  single: boolean
  onIngredientChange: (ii: number, val: string) => void
  onStepChange: (si: number, val: string) => void
}) => {
  const { t } = useTranslation()

  return (
    <div className="mb-5">
      {!single && (
        <h3 className="text-sm font-semibold text-zinc-600 mb-2">
          {comp.name}
        </h3>
      )}
      {comp.ingredients.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
            {t('recipes.sectionIngredients')}
          </p>
          <ul className="space-y-1 mb-3">
            {comp.ingredients.map((ing, ii) => (
              <li key={ii} className="flex items-start gap-2 text-sm">
                <span className="text-zinc-300 mt-1.5 shrink-0">·</span>
                <IngredientEditor
                  key={`${comp.name}-${ii}`}
                  value={ing}
                  onChange={(v) => onIngredientChange(ii, v)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {comp.steps.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase text-zinc-400 mb-1">
            {t('recipes.steps')}
          </p>
          <ol className="space-y-2">
            {comp.steps.map((step, si) => (
              <li key={si} className="flex items-start gap-2 text-sm">
                <span className="text-zinc-400 font-medium shrink-0">
                  {si + 1}.
                </span>
                <EditLine
                  value={step}
                  onChange={(v) => onStepChange(si, v)}
                  multiline
                />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface RecipeDetailModalProps {
  recipe: RecipeOut | null
  allTags: Tag[]
  onTagCreated: (tag: Tag) => void
  onClose: () => void
  onUpdated?: (r: RecipeOut) => void
  onDeleted?: (id: string) => void
  initialMode?: Mode
  activeAllergens?: string[]
  scrollToStep?: { componentIndex: number; stepIndex: number } | null
}

const RecipeDetailModal = ({
  recipe,
  allTags,
  onTagCreated,
  onClose,
  onUpdated,
  onDeleted,
  initialMode,
  activeAllergens = [],
  scrollToStep,
}: RecipeDetailModalProps) => {
  const { t } = useTranslation()
  const { enabled: debugMode } = useDebugMode()
  const wakeLock = useScreenWakeLock()
  const { addItems: addShoppingListItems } = useShoppingList()
  const [mode, setMode] = useState<Mode>('view')
  const [addMode, setAddMode] = useState(false)
  const [sessionAdded, setSessionAdded] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<EditState | null>(null)
  const [localTags, setLocalTags] = useState<Tag[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imgUploading, setImgUploading] = useState(false)
  const [localNotes, setLocalNotes] = useState(recipe?.notes ?? '')
  const [notesSaving, setNotesSaving] = useState(false)
  const savedNotesRef = useRef(recipe?.notes ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (recipe) {
      setDraft(toEditState(recipe))
      setLocalTags(recipe.tags ?? [])
      setLocalNotes(recipe.notes ?? '')
      savedNotesRef.current = recipe.notes ?? ''
      setMode(initialMode ?? 'view')
      setAddMode(false)
      setSessionAdded(new Set())
      setError(null)
    }
  }, [recipe?.id, initialMode])

  // Scroll to target step after modal opens (wait for open animation)
  useEffect(() => {
    if (!recipe || !scrollToStep) return
    const timer = setTimeout(() => {
      const el = document.getElementById(
        `timer-step-${scrollToStep.componentIndex}-${scrollToStep.stepIndex}`
      )
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.classList.add('recipe-step-highlight')
      setTimeout(() => el?.classList.remove('recipe-step-highlight'), 1800)
    }, 250)

    return () => clearTimeout(timer)
  }, [recipe?.id, scrollToStep])

  const handleThumbnailFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !recipe) return
    setImgUploading(true)
    try {
      const result = await uploadThumbnail(file, recipe.id)
      setDraft((d) => (d ? { ...d, thumbnail_url: result.url } : d))
    } catch {
      // keep existing thumbnail on failure
    } finally {
      setImgUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [recipe])

  if (!recipe || !draft) return null
  const r = recipe

  const displayThumb =
    mode === 'editing' ? draft.thumbnail_url : r.thumbnail_url
  const proxied = proxyUrl(displayThumb)

  const components =
    mode === 'editing' ? draft.components : (r.components as SaveComponent[])
  const single = components.length === 1

  const headerBg =
    mode === 'editing'
      ? 'bg-warning-100 transition-colors duration-200'
      : mode === 'confirming'
        ? 'bg-danger-100 transition-colors duration-200'
        : 'transition-colors duration-200'

  const setIngredient = (ci: number, ii: number, val: string) => {
    setDraft((d) => {
      if (!d) return d
      const comps = d.components.map((c, ci2) =>
        ci2 !== ci
          ? c
          : {
              ...c,
              ingredients: c.ingredients.map((v, ii2) =>
                ii2 === ii ? val : v
              ),
            }
      )

      return { ...d, components: comps }
    })
  }

  const setStep = (ci: number, si: number, val: string) => {
    setDraft((d) => {
      if (!d) return d
      const comps = d.components.map((c, ci2) =>
        ci2 !== ci
          ? c
          : { ...c, steps: c.steps.map((s, si2) => (si2 === si ? val : s)) }
      )

      return { ...d, components: comps }
    })
  }

  const handleTagAdd = async (tag: Tag) => {
    setLocalTags((prev) => [...prev, tag])
    try {
      await addTagToRecipe(r.id, tag.id)
    } catch {
      setLocalTags((prev) => prev.filter((t) => t.id !== tag.id))
    }
  }

  const handleTagRemove = async (tagId: string) => {
    setLocalTags((prev) => prev.filter((t) => t.id !== tagId))
    try {
      await removeTagFromRecipe(r.id, tagId)
    } catch {
      const removed = allTags.find((t) => t.id === tagId)
      if (removed) setLocalTags((prev) => [...prev, removed])
    }
  }

  const handleTagCreate = async (name: string): Promise<Tag> => {
    const tag = await createTag(name)
    onTagCreated(tag)

    return tag
  }

  const handleNotesSave = async () => {
    const trimmed = localNotes.trim()
    if (trimmed === savedNotesRef.current.trim()) return
    setNotesSaving(true)
    try {
      const updated = await updateRecipe(r.id, {
        title: r.title,
        servings: r.servings,
        kcal_per_serving: r.kcal_per_serving,
        thumbnail_url: r.thumbnail_url,
        creator_handle: r.creator_handle,
        source_url: r.source_url,
        notes: trimmed || null,
        components: r.components as SaveComponent[],
        tag_ids: localTags.map((t) => t.id),
        shared_to_personal: r.shared_to_personal,
      })
      savedNotesRef.current = trimmed
      onUpdated?.(updated)
    } catch {
      // silent — user can retry by editing again
    } finally {
      setNotesSaving(false)
    }
  }

  const handleSave = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const updated = await updateRecipe(r.id, {
        title: draft.title,
        servings: draft.servings !== '' ? Number(draft.servings) : null,
        kcal_per_serving: draft.kcal !== '' ? Number(draft.kcal) : null,
        thumbnail_url: draft.thumbnail_url,
        creator_handle: r.creator_handle,
        source_url: r.source_url,
        notes: localNotes.trim() || null,
        components: draft.components,
        tag_ids: localTags.map((t) => t.id),
        shared_to_personal: draft.shared_to_personal,
      })
      toast.success(t('recipes.recipeUpdated'), { timeout: 3000 })
      onUpdated?.(updated)
      setMode('view')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('recipes.failedToSave'))
    } finally {
      setBusy(false)
    }
  }

  const handleReplaceIngredient = async (ci: number, ii: number) => {
    const comp = (r.components as SaveComponent[])[ci]
    const flag = comp.ingredient_flags?.[ii]
    if (!flag?.substitute) return
    const originalDisplay = comp.ingredients[ii]

    const newComponents = (r.components as SaveComponent[]).map((c, cIdx) => {
      if (cIdx !== ci) return c
      const newIngredients = c.ingredients.map((ing, iIdx) =>
        iIdx === ii ? flag.substitute! : ing
      )
      const newFlags = (c.ingredient_flags ?? []).map((f, fIdx) =>
        fIdx === ii
          ? {
              ...f,
              substitute_applied: true,
              original_display: originalDisplay,
            }
          : f
      )

      return { ...c, ingredients: newIngredients, ingredient_flags: newFlags }
    })

    try {
      const updated = await updateRecipe(r.id, {
        title: r.title,
        servings: r.servings,
        kcal_per_serving: r.kcal_per_serving,
        thumbnail_url: r.thumbnail_url,
        creator_handle: r.creator_handle,
        source_url: r.source_url,
        notes: localNotes.trim() || null,
        components: newComponents,
        tag_ids: localTags.map((t) => t.id),
        shared_to_personal: r.shared_to_personal,
      })
      onUpdated?.(updated)
      setDraft(toEditState(updated))
    } catch (err) {
      toast.danger(
        err instanceof Error ? err.message : t('recipes.failedToApplySubstitute'),
        { timeout: 3000 }
      )
    }
  }

  const handleRestoreIngredient = async (ci: number, ii: number) => {
    const comp = (r.components as SaveComponent[])[ci]
    const flag = comp.ingredient_flags?.[ii]
    if (!flag?.original_display) return
    const originalDisplay = flag.original_display

    const newComponents = (r.components as SaveComponent[]).map((c, cIdx) => {
      if (cIdx !== ci) return c
      const newIngredients = c.ingredients.map((ing, iIdx) =>
        iIdx === ii ? originalDisplay : ing
      )
      const newFlags = (c.ingredient_flags ?? []).map((f, fIdx) =>
        fIdx === ii
          ? { ...f, substitute_applied: false, original_display: null }
          : f
      )

      return { ...c, ingredients: newIngredients, ingredient_flags: newFlags }
    })

    try {
      const updated = await updateRecipe(r.id, {
        title: r.title,
        servings: r.servings,
        kcal_per_serving: r.kcal_per_serving,
        thumbnail_url: r.thumbnail_url,
        creator_handle: r.creator_handle,
        source_url: r.source_url,
        notes: localNotes.trim() || null,
        components: newComponents,
        tag_ids: localTags.map((t) => t.id),
        shared_to_personal: r.shared_to_personal,
      })
      onUpdated?.(updated)
      setDraft(toEditState(updated))
    } catch (err) {
      toast.danger(
        err instanceof Error ? err.message : t('recipes.failedToRestoreIngredient'),
        { timeout: 3000 }
      )
    }
  }

  const handleDelete = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteRecipe(r.id)
      toast.danger(t('recipes.recipeDeleted'), { timeout: 3000 })
      onDeleted?.(r.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('recipes.failedToDelete'))
      setMode('view')
    } finally {
      setBusy(false)
    }
  }

  const handleAddIngredient = (ci: number, ii: number) => {
    const comp = (r.components as SaveComponent[])[ci]
    const text = formatForShoppingList(comp.ingredients[ii])
    addShoppingListItems.mutate([text])
    setSessionAdded((prev) => new Set(prev).add(`${ci}-${ii}`))
  }

  const handleAddAllIngredients = (ci: number) => {
    const comp = (r.components as SaveComponent[])[ci]
    const keys: string[] = []
    const texts: string[] = []
    comp.ingredients.forEach((ing, ii) => {
      const key = `${ci}-${ii}`
      if (!sessionAdded.has(key)) {
        keys.push(key)
        texts.push(formatForShoppingList(ing))
      }
    })
    if (texts.length === 0) return
    addShoppingListItems.mutate(texts)
    setSessionAdded((prev) => new Set([...prev, ...keys]))
  }

  const cancelMode = () => {
    if (mode === 'editing') setDraft(toEditState(r))
    setMode('view')
    setError(null)
  }

  const handleClose = () => {
    wakeLock.release()
    setMode('view')
    setError(null)
    onClose()
  }

  return (
    <Modal
      isOpen={!!recipe}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
    >
      <ModalBackdrop isDismissable>
        <ModalContainer
          size="lg"
          scroll="inside"
          className="!rounded-xl overflow-hidden"
        >
          <ModalDialog className="!p-0 max-h-[calc(100dvh-2rem)] sm:max-h-[700px]">
            {/* ── Sticky header ── */}
            <ModalHeader className="flex-col gap-0 p-0">
              {/* Hero image (or solid colour in edit/confirm mode) */}
              {/* Hidden file input for thumbnail upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleThumbnailFile}
              />

              {proxied ? (
                <div className="relative w-full h-48 shrink-0">
                  <img
                    src={proxied}
                    alt={r.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      if (PLACEHOLDER_URL) (e.target as HTMLImageElement).src = PLACEHOLDER_URL
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

                  {/* Edit-image button (editing only) */}
                  {mode === 'editing' && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={imgUploading}
                      className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/40 text-white text-xs font-semibold hover:bg-black/60 transition-colors backdrop-blur-sm disabled:opacity-60"
                    >
                      {imgUploading ? t('common.uploading') : t('common.changePhoto')}
                    </button>
                  )}

                  {/* Title + author over gradient */}
                  <div className="absolute bottom-0 inset-x-0 px-5 pb-4 pt-8">
                    {mode === 'editing' ? (
                      <EditLine
                        value={draft.title}
                        onChange={(v) =>
                          setDraft((d) => (d ? { ...d, title: v } : d))
                        }
                        className="text-xl font-bold text-white leading-snug placeholder:text-white/50"
                        multiline
                      />
                    ) : (
                      <h2 className="text-xl font-bold text-white leading-snug">
                        {r.title}
                      </h2>
                    )}
                    {r.creator_handle && (
                      <p className="text-sm text-white/75 mt-0.5">
                        @{r.creator_handle}
                      </p>
                    )}
                    {r.household_id && r.added_by && (
                      <p className="text-xs text-white/60 mt-0.5">
                        Added by {r.added_by}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* No image: plain title block */
                <div className={`px-5 pt-5 pb-1 ${headerBg}`}>
                  {mode === 'editing' ? (
                    <EditLine
                      value={draft.title}
                      onChange={(v) =>
                        setDraft((d) => (d ? { ...d, title: v } : d))
                      }
                      className="text-xl font-bold leading-snug"
                      multiline
                    />
                  ) : (
                    <h2 className="text-xl font-bold leading-snug">
                      {r.title}
                    </h2>
                  )}
                  {r.creator_handle && (
                    <p className="text-sm text-zinc-500 mt-0.5">
                      @{r.creator_handle}
                    </p>
                  )}
                  {r.household_id && r.added_by && (
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Added by {r.added_by}
                    </p>
                  )}
                </div>
              )}

              {/* Edit-image button when no current image */}
              {mode === 'editing' && !proxied && (
                <div className={`px-5 pt-2 ${headerBg}`}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imgUploading}
                    className="text-sm text-primary underline disabled:opacity-60"
                  >
                    {imgUploading ? t('common.uploading') : t('common.addPhoto')}
                  </button>
                </div>
              )}

              {/* Metadata: tags, pills, actions */}
              <div className={`px-5 pt-3 pb-3 flex flex-col gap-2 ${headerBg}`}>
                {/* Tags — always visible */}
                <TagRow
                  tags={localTags}
                  allTags={allTags}
                  onAdd={handleTagAdd}
                  onRemove={handleTagRemove}
                  onCreateTag={handleTagCreate}
                />

                {/* Serves / kcal / source pills */}
                {(draft.servings !== '' ||
                  draft.kcal !== '' ||
                  r.servings != null ||
                  r.kcal_per_serving != null ||
                  r.source_url) && (
                  <div className="flex flex-wrap gap-2 items-center">
                    {mode === 'editing' ? (
                      <>
                        <label className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium pl-3 pr-2 py-1.5 rounded-full cursor-text">
                          <span>{t('recipes.serves')}</span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={draft.servings}
                            onChange={(e) =>
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      servings: String(
                                        Math.min(
                                          99,
                                          Math.max(1, Number(e.target.value))
                                        )
                                      ),
                                    }
                                  : d
                              )
                            }
                            className="w-[2.2ch] bg-transparent text-primary font-semibold text-xs text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 bg-warning/10 text-warning-700 text-xs font-medium pl-2 pr-3 py-1.5 rounded-full cursor-text">
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            value={draft.kcal}
                            onChange={(e) =>
                              setDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      kcal: String(
                                        Math.min(
                                          9999,
                                          Math.max(1, Number(e.target.value))
                                        )
                                      ),
                                    }
                                  : d
                              )
                            }
                            className="w-[3.8ch] bg-transparent text-warning-700 font-semibold text-xs text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <span>{t('recipes.kcalPerServing')}</span>
                        </label>
                      </>
                    ) : (
                      <>
                        {r.servings != null && (
                          <span className="text-xs text-primary font-medium bg-primary/10 px-3 py-1.5 rounded-full">
                            {t('recipes.serves')} {r.servings}
                          </span>
                        )}
                        {r.kcal_per_serving != null && (
                          <span className="text-xs text-warning-700 font-medium bg-warning/10 px-3 py-1.5 rounded-full">
                            {r.kcal_per_serving} {t('recipes.kcalPerServing')}
                          </span>
                        )}
                      </>
                    )}
                    {r.source_url && (
                      <a
                        href={r.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 transition-colors"
                      >
                        <Link className="w-3.5 h-3.5" />
                        {t('recipes.source')}
                      </a>
                    )}
                  </div>
                )}

                {debugMode && r.debug_model && (
                  <div className="flex flex-col gap-0.5 rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      {t('recipes.debugInfo')}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {t('recipes.debugModel')}: {r.debug_model}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {t('recipes.debugTokens')}: {r.debug_total_tokens ?? '—'}
                      {' '}
                      ({t('recipes.debugInputTokens')} {r.debug_input_tokens ?? '—'}
                      {' · '}
                      {t('recipes.debugOutputTokens')} {r.debug_output_tokens ?? '—'})
                    </span>
                  </div>
                )}

                {/* Action bar */}
                {mode === 'view' && (
                  <div className="flex gap-2 pt-0.5 items-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => setMode('editing')}
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger-soft"
                      onPress={() => setMode('confirming')}
                    >
                      {t('recipes.remove')}
                    </Button>
                    <Button
                      size="sm"
                      variant={addMode ? 'primary' : 'secondary'}
                      onPress={() => setAddMode((v) => !v)}
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      {t('shoppingList.addToList')}
                    </Button>
                    {'wakeLock' in navigator && (
                      <button
                        type="button"
                        title={
                          wakeLock.active
                            ? t('recipes.screenAlwaysOnDisable')
                            : t('recipes.keepScreenOnWhileReading')
                        }
                        onClick={wakeLock.toggle}
                        className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          wakeLock.active
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        {wakeLock.active ? t('recipes.screenOn') : t('recipes.keepOn')}
                      </button>
                    )}
                  </div>
                )}
                {mode === 'editing' && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={cancelMode}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-warning text-warning-foreground hover:bg-warning-400 transition-colors"
                    >
                      ✎ {t('recipes.editingTapToCancel')}
                    </button>
                  </div>
                )}
                {mode === 'confirming' && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-danger text-danger-foreground">
                      {t('recipes.deleteThisRecipe')}
                    </span>
                  </div>
                )}
              </div>
              {/* end metadata block */}
            </ModalHeader>

            {/* ── Scrollable body ── */}
            <ModalBody className="!px-5 !pb-5 !pt-0">
              {error && (
                <div className="bg-danger-50 text-danger rounded-lg p-3 text-sm mb-3">
                  {error}
                </div>
              )}

              {mode === 'editing'
                ? components.map((comp, ci) => (
                    <EditComponent
                      key={ci}
                      comp={comp}
                      single={single}
                      onIngredientChange={(ii, val) =>
                        setIngredient(ci, ii, val)
                      }
                      onStepChange={(si, val) => setStep(ci, si, val)}
                    />
                  ))
                : components.map((comp, ci) => (
                    <ViewComponent
                      key={ci}
                      comp={comp as SaveComponent}
                      single={single}
                      activeAllergens={activeAllergens}
                      onReplaceIngredient={(ii) =>
                        handleReplaceIngredient(ci, ii)
                      }
                      onRestoreIngredient={(ii) =>
                        handleRestoreIngredient(ci, ii)
                      }
                      recipeId={r.id}
                      recipeTitle={r.title}
                      componentIndex={ci}
                      addMode={addMode}
                      sessionAdded={sessionAdded}
                      onAddIngredient={(ii) => handleAddIngredient(ci, ii)}
                      onAddAllIngredients={() => handleAddAllIngredients(ci)}
                    />
                  ))}

              {/* Notes — always editable, auto-saved on blur */}
              <div className="mt-2 pt-4 border-t border-zinc-100">
                <p className="text-xs font-semibold uppercase text-zinc-400 mb-1.5">
                  {t('recipes.notes')}
                  {notesSaving && (
                    <span className="ml-2 font-normal normal-case text-zinc-400">
                      {t('common.saving')}
                    </span>
                  )}
                </p>
                <textarea
                  value={localNotes}
                  onChange={(e) => setLocalNotes(e.target.value)}
                  onBlur={handleNotesSave}
                  placeholder={t('common.addPrivateNotes')}
                  rows={3}
                  className="w-full text-sm bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary resize-none leading-relaxed placeholder:text-zinc-400"
                  style={
                    {
                      minHeight: '4rem',
                      fieldSizing: 'content',
                    } as React.CSSProperties
                  }
                />
              </div>
            </ModalBody>

            <ModalFooter className="flex-col gap-2 items-stretch px-5 pb-5 pt-3">
              {mode === 'editing' && r.household_id && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-sm text-zinc-600">
                    {t('recipes.alsoInPrivate')}
                  </span>
                  <Switch
                    size="sm"
                    isSelected={draft?.shared_to_personal ?? true}
                    onChange={(v) =>
                      setDraft((d) => (d ? { ...d, shared_to_personal: v } : d))
                    }
                  >
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch>
                </div>
              )}
              <div className="flex justify-end gap-2">
                {mode === 'editing' && (
                  <>
                    <Button
                      variant="tertiary"
                      onPress={cancelMode}
                      isDisabled={busy}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      onPress={handleSave}
                      isDisabled={busy}
                    >
                      {t('common.save')}
                    </Button>
                  </>
                )}
                {mode === 'confirming' && (
                  <>
                    <Button
                      variant="tertiary"
                      onPress={cancelMode}
                      isDisabled={busy}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      variant="danger"
                      onPress={handleDelete}
                      isDisabled={busy}
                    >
                      {t('common.delete')}
                    </Button>
                  </>
                )}
                {mode === 'view' && (
                  <Button variant="tertiary" onPress={handleClose}>
                    {t('common.close')}
                  </Button>
                )}
              </div>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default RecipeDetailModal
