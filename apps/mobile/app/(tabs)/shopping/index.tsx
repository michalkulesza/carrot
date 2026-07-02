import { StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import BellMenu from '../../../src/components/BellMenu'
import BugReportButton from '../../../src/components/BugReportButton'
import ShoppingListScreen from '../../../src/screens/ShoppingListScreen'

export default function ShoppingTab() {
  const { t } = useTranslation()

  return (
    <>
      <Stack.Screen
        options={{
          title: t('nav.shopping'),
          headerRight: () => (
            <View style={styles.headerRight}>
              <BugReportButton />
              <BellMenu />
            </View>
          ),
        }}
      />
      <ShoppingListScreen />
    </>
  )
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
