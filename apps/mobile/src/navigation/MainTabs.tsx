import { useEffect } from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import { usePreferences } from '@platekeeper/shared/hooks/usePreferences'
import RecipesStack from './RecipesStack'
import MealPlanScreen from '../screens/MealPlanScreen'
import ShoppingListScreen from '../screens/ShoppingListScreen'
import SettingsStack from './SettingsStack'
import BellModal from '../components/BellModal'
import { persistLanguage } from '../i18n'

export type MainTabsParamList = {
  Recipes: undefined
  MealPlan: undefined
  Shopping: undefined
  Settings: undefined
}

const Tab = createBottomTabNavigator<MainTabsParamList>()

const BellHeader = () => <BellModal />

const MainTabs = () => {
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
    <Tab.Navigator>
      <Tab.Screen
        name="Recipes"
        component={RecipesStack}
        options={{
          title: t('nav.recipes'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Feather name="book" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="MealPlan"
        component={MealPlanScreen}
        options={{
          title: t('nav.mealPlan'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Shopping"
        component={ShoppingListScreen}
        options={{
          title: t('nav.shopping'),
          headerRight: BellHeader,
          tabBarIcon: ({ color, size }) => (
            <Feather name="shopping-cart" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{
          title: t('nav.settings'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Feather name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}

export default MainTabs
