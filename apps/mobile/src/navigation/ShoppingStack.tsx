import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import ShoppingListScreen from '../screens/ShoppingListScreen'
import BellModal from '../components/BellModal'

export type ShoppingStackParamList = {
  ShoppingMain: undefined
}

const Stack = createNativeStackNavigator<ShoppingStackParamList>()

const BellHeader = () => <BellModal />

const ShoppingStack = () => {
  const { t } = useTranslation()
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ShoppingMain"
        component={ShoppingListScreen}
        options={{ title: t('nav.shopping'), headerRight: BellHeader }}
      />
    </Stack.Navigator>
  )
}

export default ShoppingStack
