import en from './locales/en.json'
import de from './locales/de.json'
import pl from './locales/pl.json'
import fr from './locales/fr.json'
import es from './locales/es.json'

export const i18nResources = {
  en: { translation: en },
  de: { translation: de },
  pl: { translation: pl },
  fr: { translation: fr },
  es: { translation: es },
}

export const i18nBaseConfig = {
  resources: i18nResources,
  fallbackLng: 'en',
  supportedLngs: ['en', 'de', 'pl', 'fr', 'es'],
  interpolation: { escapeValue: false },
} as const
