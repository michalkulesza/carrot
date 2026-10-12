import type { CSSProperties } from 'react'
import { SUPPORTED_LOCALES } from '@carrot/shared/supportedLocales'
import { HOUSEHOLD_COLOR_OPTIONS } from '@carrot/shared/utils/householdColors'

export const WEEK_DAY_OPTIONS = [
  { key: '1', labelKey: 'settings.monday' },
  { key: '0', labelKey: 'settings.sunday' },
  { key: '6', labelKey: 'settings.saturday' },
]

export const PRESET_COLORS = HOUSEHOLD_COLOR_OPTIONS

export const LANGUAGE_CODES = SUPPORTED_LOCALES

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

export const buildColorSwatchStyle = (
  color: string,
  selectedColor: string
): CSSProperties => ({
  backgroundColor: color,
  borderColor: selectedColor === color ? 'white' : 'transparent',
  boxShadow: selectedColor === color ? `0 0 0 2px ${color}` : undefined,
})
