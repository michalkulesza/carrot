import { useEffect } from 'react'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useTranslation } from 'react-i18next'
import { usePreferences } from '@platekeeper/shared/hooks/usePreferences'
import { persistLanguage } from '../../src/i18n'

export default function TabsLayout() {
  const { t, i18n } = useTranslation()
  const { preferences } = usePreferences()

  useEffect(() => {
    const lang = preferences?.language
    if (lang && lang !== i18n.language) {
      void i18n.changeLanguage(lang)
      void persistLanguage(lang)
    }
  }, [preferences?.language, i18n])

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="recipes">
        <NativeTabs.Trigger.Icon sf="book" md="menu-book" />
        <NativeTabs.Trigger.Label>{t('nav.recipes')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="meal-plan">
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar-today" />
        <NativeTabs.Trigger.Label>{t('nav.mealPlan')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="shopping">
        <NativeTabs.Trigger.Icon sf="cart" md="shopping-cart" />
        <NativeTabs.Trigger.Label>{t('nav.shopping')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="add" role="search">
        <NativeTabs.Trigger.Icon sf="plus.circle.fill" md="add-circle" />
        <NativeTabs.Trigger.Label>{t('nav.addRecipe')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
