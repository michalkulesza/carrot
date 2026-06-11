import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import SettingsScreen from '../screens/SettingsScreen'
import HouseholdDetailScreen from '../screens/HouseholdDetailScreen'
import BellModal from '../components/BellModal'

export type SettingsStackParamList = {
  SettingsMain: undefined
  HouseholdDetail: { householdId: string; householdName: string }
}

const Stack = createNativeStackNavigator<SettingsStackParamList>()

const BellHeader = () => <BellModal />

const SettingsStack = () => {
  const { t } = useTranslation()
  return (
    <Stack.Navigator
      screenOptions={{ headerRight: BellHeader }}
    >
      <Stack.Screen
        name="SettingsMain"
        component={SettingsScreen}
        options={{ title: t('settings.title') }}
      />
      <Stack.Screen
        name="HouseholdDetail"
        component={HouseholdDetailScreen}
        options={({ route }) => ({ title: route.params.householdName })}
      />
    </Stack.Navigator>
  )
}

export default SettingsStack
