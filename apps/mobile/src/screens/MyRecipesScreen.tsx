import { PlatformColor, StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import HeaderTitle from '../components/HeaderTitle'
import { useHousehold } from '../context/HouseholdContext'
import MyRecipesSection from './SettingsScreen/MyRecipesSection'

const MyRecipesScreen = () => {
  const { t } = useTranslation()
  const { households, activeHouseholdId } = useHousehold()

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle title={t('settings.myRecipes')} />,
          headerBackTitle: t('common.back'),
        }}
      />
      <MyRecipesSection
        households={households}
        activeHouseholdId={activeHouseholdId}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PlatformColor('systemGroupedBackground') as unknown as string,
  },
})

export default MyRecipesScreen
