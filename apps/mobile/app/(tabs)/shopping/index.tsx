import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import BellModal from '../../../src/components/BellModal'
import ShoppingListScreen from '../../../src/screens/ShoppingListScreen'

export default function ShoppingTab() {
  const { t } = useTranslation()

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => <BellModal />,
        }}
      />
      <ShoppingListScreen />
    </>
  )
}
