import en from './locales/en.json'
import de from './locales/de.json'
import pl from './locales/pl.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import it from './locales/it.json'
import pt from './locales/pt.json'
import { SUPPORTED_LOCALES } from './supportedLocales'

export const i18nResources = {
  en: { translation: en },
  de: { translation: de },
  pl: { translation: pl },
  fr: { translation: fr },
  es: { translation: es },
  it: { translation: it },
  pt: { translation: pt },
}

export const i18nBaseConfig = {
  resources: i18nResources,
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LOCALES,
  // Regional codes ("pt-BR", "it-CH") resolve to their base locale's resources.
  nonExplicitSupportedLngs: true,
  interpolation: { escapeValue: false },
} as const
