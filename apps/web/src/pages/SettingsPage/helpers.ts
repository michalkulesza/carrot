import type { CSSProperties } from 'react'
import type { AllergenData } from '@carrot/shared/types'

export const WEEK_DAY_OPTIONS = [
  { key: '1', labelKey: 'settings.monday' },
  { key: '0', labelKey: 'settings.sunday' },
  { key: '6', labelKey: 'settings.saturday' },
]

export const PRESET_COLORS = [
  '#6366f1',
  '#ec4899',
  '#14b8a6',
  '#f59e0b',
  '#22c55e',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
]

export const ALLERGEN_KEYS = [
  'gluten',
  'crustaceans',
  'tree nuts',
  'celery',
  'mustard',
  'sulphites',
  'lupin',
  'molluscs',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'sesame',
]

export const INTOLERANCE_KEYS = [
  'lactose',
  'ncgs',
  'fructose',
  'histamine',
  'fodmap',
  'caffeine',
  'sulphite-sensitivity',
  'sorbitol',
  'salicylates',
  'msg',
]

export const LANGUAGE_CODES = ['en', 'de', 'pl', 'fr', 'es'] as const

export const normalizeAllergenKey = (key: string) => key.replace(/[- ]/g, '_')

const TIMER_STATUS_COLOR_CLASSES: Record<string, string> = {
  done: 'text-emerald-600',
  paused: 'text-zinc-400',
  running: 'text-amber-600',
}

export const timerStatusColorClass = (status: string) =>
  TIMER_STATUS_COLOR_CLASSES[status] ?? 'text-amber-600'

const STEP_TEXT_TRUNCATE_LENGTH = 55

export const truncateStepText = (text: string) =>
  text.length > STEP_TEXT_TRUNCATE_LENGTH
    ? text.slice(0, STEP_TEXT_TRUNCATE_LENGTH - 3) + '…'
    : text

export const emptyAllergenData: AllergenData = { predefined: [], custom: [] }

export const buildColorSwatchStyle = (
  color: string,
  selectedColor: string
): CSSProperties => ({
  backgroundColor: color,
  borderColor: selectedColor === color ? 'white' : 'transparent',
  boxShadow: selectedColor === color ? `0 0 0 2px ${color}` : undefined,
})
