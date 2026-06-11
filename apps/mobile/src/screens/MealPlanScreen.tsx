import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

const MealPlanScreen = () => {
  const { t } = useTranslation()
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{t('nav.mealPlan')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 20, color: '#6b7280' },
})

export default MealPlanScreen
