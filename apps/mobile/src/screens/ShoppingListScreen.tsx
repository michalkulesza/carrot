import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

const ShoppingListScreen = () => {
  const { t } = useTranslation()
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🛒</Text>
      <Text style={styles.message}>{t('shoppingList.comingSoon')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb', padding: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  message: { fontSize: 16, color: '#6b7280', textAlign: 'center' },
})

export default ShoppingListScreen
