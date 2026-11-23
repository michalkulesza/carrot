import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import HeaderTitle from '../../../src/components/HeaderTitle'
import ShoppingListScreen from '../../../src/screens/ShoppingListScreen'

const ShoppingHeaderTitle = () => {
  const { t } = useTranslation()

  return <HeaderTitle title={t('shoppingList.title')} />
}

const renderShoppingHeaderTitle = () => <ShoppingHeaderTitle />

const shoppingHeaderOptions = {
  headerTitle: renderShoppingHeaderTitle,
}

export default function ShoppingTab() {
  return (
    <>
      <Stack.Screen options={shoppingHeaderOptions} />
      <ShoppingListScreen />
    </>
  )
}
