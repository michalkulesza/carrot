import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'

const SettingsScreen = () => {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.settings')}</Text>
      {user && <Text style={styles.email}>{user.email}</Text>}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={logout}
        accessibilityLabel={t('settings.logOut')}
        accessibilityRole="button"
      >
        <Text style={styles.logoutText}>{t('settings.logOut')}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#111' },
  email: { fontSize: 15, color: '#6b7280', marginBottom: 32 },
  logoutButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  logoutText: { color: '#dc2626', fontSize: 15, fontWeight: '500' },
})

export default SettingsScreen
