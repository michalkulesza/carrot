import { PlatformColor, StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import HeaderTitle from '../components/HeaderTitle'
import { useHousehold } from '../context/HouseholdContext'
import MyRecipesSection from './SettingsScreen/MyRecipesSection'

const MyRecipesScreen = () => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { households, activeHouseholdId } = useHousehold()

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 48 },
      ]}
    >
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
