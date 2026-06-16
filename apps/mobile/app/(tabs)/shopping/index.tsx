import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import BellMenu from '../../../src/components/BellMenu'
import ShoppingListScreen from '../../../src/screens/ShoppingListScreen'

export default function ShoppingTab() {
  const { t } = useTranslation()

  return (
    <>
      <Stack.Screen
        options={{
          title: t('nav.shopping'),
          headerRight: () => <BellMenu />,
          headerBlurEffect: 'systemMaterial',
        }}
      />
      <ShoppingListScreen />
    </>
  )
}
