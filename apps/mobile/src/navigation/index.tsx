import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import AuthStack from './AuthStack'
import MainTabs from './MainTabs'

const RootNavigator = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return user ? <MainTabs /> : <AuthStack />
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
})

export default RootNavigator
