import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useTranslation } from 'react-i18next'
import RecipesScreen from '../screens/RecipesScreen'
import MealPlanScreen from '../screens/MealPlanScreen'
import ShoppingListScreen from '../screens/ShoppingListScreen'
import SettingsScreen from '../screens/SettingsScreen'

export type MainTabsParamList = {
  Recipes: undefined
  MealPlan: undefined
  Shopping: undefined
  Settings: undefined
}

const Tab = createBottomTabNavigator<MainTabsParamList>()

const MainTabs = () => {
  const { t } = useTranslation()
  return (
    <Tab.Navigator>
      <Tab.Screen name="Recipes" component={RecipesScreen} options={{ title: t('nav.recipes') }} />
      <Tab.Screen name="MealPlan" component={MealPlanScreen} options={{ title: t('nav.mealPlan') }} />
      <Tab.Screen name="Shopping" component={ShoppingListScreen} options={{ title: t('nav.shopping') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
    </Tab.Navigator>
  )
}

export default MainTabs
