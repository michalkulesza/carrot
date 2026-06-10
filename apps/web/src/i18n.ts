import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { i18nBaseConfig } from '@platekeeper/shared/i18n'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    ...i18nBaseConfig,
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'pk-language',
    },
  })

export default i18n
