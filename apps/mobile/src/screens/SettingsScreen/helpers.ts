import { Platform } from 'react-native'
import { SUPPORTED_LOCALES } from '@carrot/shared/supportedLocales'
import type { AppearanceMode } from '../../context/ColorSchemeContext'

export const CARD_RADIUS = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26 ? 20 : 10

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
  { value: 'system', labelKey: 'settings.appearanceSystem' },
  { value: 'light', labelKey: 'settings.appearanceLight' },
  { value: 'dark', labelKey: 'settings.appearanceDark' },
]

export const iKey = (k: string) => k.replace(/[- ]/g, '_')

export const KEEP_AWAKE_STORAGE_KEY = 'recipe-keep-screen-default'
export const KEEP_AWAKE_SHOPPING_STORAGE_KEY = 'shopping-list-keep-screen-on'
