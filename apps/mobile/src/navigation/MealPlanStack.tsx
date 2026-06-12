import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import MealPlanScreen from '../screens/MealPlanScreen'

export type MealPlanStackParamList = {
  MealPlanMain: undefined
}

const Stack = createNativeStackNavigator<MealPlanStackParamList>()

const MealPlanStack = () => {
  const { t } = useTranslation()
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MealPlanMain"
        component={MealPlanScreen}
        options={{ title: t('nav.mealPlan') }}
      />
    </Stack.Navigator>
  )
}

export default MealPlanStack
