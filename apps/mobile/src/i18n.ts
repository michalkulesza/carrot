import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { i18nBaseConfig } from '@carrot/shared/i18n'
import { resolveSupportedLocale } from '@carrot/shared/supportedLocales'

export const LANGUAGE_STORAGE_KEY = 'pk-language'

i18n.use(initReactI18next).init({
  ...i18nBaseConfig,
  lng: 'en',
})

AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then(saved => {
  const locale = resolveSupportedLocale(saved)
  if (locale && locale !== i18n.language) void i18n.changeLanguage(locale)
})

export const persistLanguage = (code: string) =>
  AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code)

export default i18n
