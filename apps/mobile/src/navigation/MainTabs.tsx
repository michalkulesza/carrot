import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import RecipesStack from './RecipesStack'
import MealPlanScreen from '../screens/MealPlanScreen'
import ShoppingListScreen from '../screens/ShoppingListScreen'
import SettingsStack from './SettingsStack'
import BellModal from '../components/BellModal'

export type MainTabsParamList = {
  Recipes: undefined
  MealPlan: undefined
  Shopping: undefined
  Settings: undefined
}

const Tab = createBottomTabNavigator<MainTabsParamList>()

const BellHeader = () => <BellModal />

const MainTabs = () => {
  const { t } = useTranslation()
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
          headerRight: BellHeader,
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
