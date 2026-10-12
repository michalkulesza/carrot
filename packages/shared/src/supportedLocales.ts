export const SUPPORTED_LOCALES = ['en', 'pl', 'de', 'fr', 'es', 'it', 'pt'] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

// Each language is always shown in its own language so users can find it.
export const LOCALE_NATIVE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  pl: 'Polski',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
}

export const isSupportedLocale = (code: string): code is SupportedLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(code)

// Maps device/browser codes such as "pt-BR" or "it_CH" to a supported base locale.
export const resolveSupportedLocale = (code: string | null | undefined): SupportedLocale | null => {
  const base = code?.split(/[-_]/)[0]?.toLowerCase()

  return base && isSupportedLocale(base) ? base : null
}
