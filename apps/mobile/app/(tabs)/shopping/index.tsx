import { StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import BellMenu from '../../../src/components/BellMenu'
import BugReportButton from '../../../src/components/BugReportButton'
import HeaderTitle from '../../../src/components/HeaderTitle'
import ShoppingListScreen from '../../../src/screens/ShoppingListScreen'

const ShoppingHeaderTitle = () => {
  const { t } = useTranslation()

  return <HeaderTitle title={t('shoppingList.title')} />
}

const renderShoppingHeaderTitle = () => <ShoppingHeaderTitle />

const ShoppingHeaderRight = () => (
  <View style={styles.headerRight}>
    <BugReportButton />
    <BellMenu />
  </View>
)

const shoppingHeaderOptions = {
  headerTitle: renderShoppingHeaderTitle,
  headerRight: ShoppingHeaderRight,
}

export default function ShoppingTab() {
  return (
    <>
      <Stack.Screen options={shoppingHeaderOptions} />
      <ShoppingListScreen />
    </>
  )
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
