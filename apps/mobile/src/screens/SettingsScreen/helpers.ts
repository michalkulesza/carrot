import { SUPPORTED_LOCALES } from '@carrot/shared/supportedLocales'
import type { AppearanceMode } from '../../context/ColorSchemeContext'

export const LANGUAGES: { code: string; labelKey: string }[] = SUPPORTED_LOCALES.map(code => ({
  code,
  labelKey: `languages.${code}`,
}))

export const WEEK_START_OPTIONS: { value: number; labelKey: string }[] = [
  { value: 0, labelKey: 'settings.sunday' },
  { value: 1, labelKey: 'settings.monday' },
  { value: 6, labelKey: 'settings.saturday' },
]

export const APPEARANCE_OPTIONS: { value: AppearanceMode; labelKey: string }[] = [
  { value: 'light', labelKey: 'settings.appearanceLight' },
  { value: 'dark', labelKey: 'settings.appearanceDark' },
  { value: 'system', labelKey: 'settings.appearanceAuto' },
]

export const UNIT_OPTIONS = [
  { value: 'metric', labelKey: 'settings.metric' },
  { value: 'imperial', labelKey: 'settings.unitsUS' },
] as const

export const KEEP_AWAKE_SHOPPING_STORAGE_KEY = 'shopping-list-keep-screen-on'

export const PRIVACY_POLICY_URL = 'https://carrot.xcxz.xyz/privacy-policy'
