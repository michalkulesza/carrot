import { HOUSEHOLD_COLOR_OPTIONS } from '@carrot/shared/utils/householdColors'

export const PRESET_COLORS = HOUSEHOLD_COLOR_OPTIONS

const COLOR_NAME_KEYS = [
  'settings.colorIndigo',
  'settings.colorPink',
  'settings.colorTeal',
  'settings.colorGreen',
  'settings.colorRed',
  'settings.colorViolet',
  'settings.colorCyan',
]

export const colorNameKey = (color: string) => COLOR_NAME_KEYS[PRESET_COLORS.indexOf(color)] ?? 'settings.colorLabel'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isValidEmail = (value: string) => EMAIL_PATTERN.test(value.trim())

export const memberColorFor = (userId: string) => {
  let hash = 0
  for (let index = 0; index < userId.length; index++) hash = (hash * 31 + userId.charCodeAt(index)) >>> 0

  return PRESET_COLORS[hash % PRESET_COLORS.length]
}

export type InviteTab = 'link' | 'email'
