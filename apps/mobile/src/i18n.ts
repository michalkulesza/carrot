import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { i18nBaseConfig } from '@platekeeper/shared/i18n'

i18n.use(initReactI18next).init({
  ...i18nBaseConfig,
  lng: 'en',
})

export default i18n
