import '../src/i18n'
import i18n from '../src/i18n'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as Sentry from '@sentry/react-native'
import { useQueryClient } from '@tanstack/react-query'
import { consumePendingShare, hasPendingShare } from '../src/utils/pendingShare'

if (!__DEV__) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
  })
}
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { ApiClientProvider } from '@platekeeper/shared/api/context'
import { AuthProvider, useAuth } from '../src/context/AuthContext'
import { NotificationHistoryProvider } from '../src/context/NotificationHistoryContext'
import { TimerProvider } from '../src/context/TimerContext'
import { HouseholdProvider } from '../src/context/HouseholdContext'
import { ColorSchemeProvider } from '../src/context/ColorSchemeContext'
import { mobileClient } from '../src/api/client'

const queryClient = new QueryClient()

function RootLayoutNav() {
  const { t } = useTranslation()
  const { user, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()
  const qc = useQueryClient()
  const [processingShare, setProcessingShare] = useState(false)

  useEffect(() => {
    if (loading) return
    const inAuth = segments[0] === '(auth)'
    if (!user && !inAuth) {
      router.replace('/(auth)/login')
    } else if (user && inAuth) {
      router.replace('/(tabs)')
    }
  }, [user, loading, segments])

  // Fallback for the Share Extension: some host apps (e.g. Photos) decline to relay the
  // extension's deep link, so the share would otherwise be silently lost. The extension always
  // also persists the share to the App Group container, which we poll for here on launch and
  // every time the app comes back to the foreground.
  useEffect(() => {
    if (loading || !user) return

    const checkPendingShare = async () => {
      // Consuming is async (file read + base64 decode); block interaction for that brief
      // window so a manual tap (e.g. the "+" add-recipe button) can't push its own screen
      // a moment before this pushes another import-recipe screen on top of it.
      if (!hasPendingShare()) return
      setProcessingShare(true)
      try {
        const pending = await consumePendingShare()
        if (pending) {
          router.push({ pathname: '/import-recipe', params: pending })
        }
      } finally {
        setProcessingShare(false)
      }
    }

    checkPendingShare()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPendingShare()
    })
    return () => subscription.remove()
  }, [loading, user])

  // Invalidate all cached queries when the app returns to the foreground so that data
  // saved externally (e.g. via the Share Extension) appears without a manual pull-to-refresh.
  useEffect(() => {
    if (loading || !user) return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') qc.invalidateQueries()
    })
    return () => subscription.remove()
  }, [loading, user, qc])

  return (
    <>
      <Stack screenOptions={{ headerBackTitle: t('common.back'), headerTransparent: true, headerShadowVisible: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="import-recipe" options={{ title: t('addRecipe.addRecipe') }} />
        <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
        <Stack.Screen name="recipe/[id]/edit" options={{ title: '' }} />
        <Stack.Screen name="household/[id]" options={{ title: '' }} />
      </Stack>
      {(loading || processingShare) && (
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
      <BottomSheetModalProvider>
        <ColorSchemeProvider>
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
        </ColorSchemeProvider>
      </BottomSheetModalProvider>
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
