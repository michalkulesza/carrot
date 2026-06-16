import { useCallback, useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { usePreferences } from '@platekeeper/shared/hooks/usePreferences'
import { persistLanguage } from '../../src/i18n'
import { colors } from '../../src/theme/colors'

const TAB_BAR_HEIGHT = 49

const AddFAB = () => {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const handlePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.push('/import-recipe')
  }, [router])

  return (
    <Pressable
      style={[styles.fab, { bottom: insets.bottom + TAB_BAR_HEIGHT + 16 }]}
      onPress={handlePress}
      accessibilityLabel="Add recipe"
      accessibilityRole="button"
      hitSlop={8}
    >
      <Text style={styles.fabIcon}>+</Text>
    </Pressable>
  )
}

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
    <View style={styles.container}>
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

        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
          <NativeTabs.Trigger.Label>{t('nav.settings')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="search" role="search">
          <NativeTabs.Trigger.Label>{t('nav.search')}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      <AddFAB />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabIcon: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    lineHeight: 32,
    marginTop: -1,
  },
})
