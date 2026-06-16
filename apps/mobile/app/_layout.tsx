import '../src/i18n'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as Sentry from '@sentry/react-native'

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
})
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import i18n from '../src/i18n'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { ApiClientProvider } from '@platekeeper/shared/api/context'
import { AuthProvider, useAuth } from '../src/context/AuthContext'
import { NotificationHistoryProvider } from '../src/context/NotificationHistoryContext'
import { TimerProvider } from '../src/context/TimerContext'
import { HouseholdProvider } from '../src/context/HouseholdContext'
import { mobileClient } from '../src/api/client'

const queryClient = new QueryClient()

function RootLayoutNav() {
  const { user, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    const inAuth = segments[0] === '(auth)'
    if (!user && !inAuth) {
      router.replace('/(auth)/login')
    } else if (user && inAuth) {
      router.replace('/(tabs)')
    }
  }, [user, loading, segments])

  return (
    <>
      <Stack screenOptions={{ headerBackTitle: '', headerTransparent: true, headerShadowVisible: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, headerBackTitle: '' }} />
        <Stack.Screen name="import-recipe" options={{ title: '' }} />
        <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
        <Stack.Screen name="recipe/[id]/edit" options={{ title: '' }} />
        <Stack.Screen name="household/[id]" options={{ title: '' }} />
      </Stack>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" />
        </View>
      )}
    </>
  )
}

const RootLayout = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ApiClientProvider client={mobileClient}>
            <AuthProvider>
              <NotificationHistoryProvider>
                <TimerProvider>
                  <HouseholdProvider>
                    <RootLayoutNav />
                  </HouseholdProvider>
                </TimerProvider>
              </NotificationHistoryProvider>
            </AuthProvider>
          </ApiClientProvider>
        </I18nextProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

export default Sentry.wrap(RootLayout)

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
