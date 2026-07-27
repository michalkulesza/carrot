import { Redirect } from 'expo-router'
import { useHousehold } from '../../src/context/HouseholdContext'
import GettingStartedScreen from '../../src/screens/GettingStartedScreen'

export default function Index() {
  const { households, isLoadingHouseholds } = useHousehold()
  if (isLoadingHouseholds) return null
  if (households.length === 0) return <GettingStartedScreen />
  return <Redirect href="/(tabs)/recipes" />
}
