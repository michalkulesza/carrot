import '../src/i18n'
import i18n from '../src/i18n'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native'
import * as Sentry from '@sentry/react-native'
import * as Notifications from 'expo-notifications'
import { useQueryClient } from '@tanstack/react-query'
import { useNotificationHistory } from '../src/context/NotificationHistoryContext'
import BugReportButton from '../src/components/BugReportButton'
import HeaderTitle from '../src/components/HeaderTitle'
import { colors } from '../src/theme/colors'
import { useResolvedColorScheme } from '../src/context/ColorSchemeContext'

if (!__DEV__) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
  })
}
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { I18nextProvider } from 'react-i18next'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { ApiClientProvider, useApiClient } from '@carrot/shared/api/context'
import { useImportJobs } from '@carrot/shared/hooks/useImportJobs'
import { AuthProvider, useAuth } from '../src/context/AuthContext'
import { NotificationHistoryProvider } from '../src/context/NotificationHistoryContext'
import { TimerProvider } from '../src/context/TimerContext'
import { HouseholdProvider } from '../src/context/HouseholdContext'
import { ColorSchemeProvider } from '../src/context/ColorSchemeContext'
import { CookingModeProvider } from '../src/context/CookingModeContext'
import { mobileClient } from '../src/api/client'
import { configureGoogleSignin } from '../src/utils/googleAuth'
import { createUuid } from '../src/utils/uuid'

configureGoogleSignin()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cached data is shown immediately and refetched silently in the background
      // instead of blocking on a spinner for this long after it's restored from disk.
      staleTime: 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    },
  },
})

// Dynamic (PlatformColor/DynamicColorIOS) colors already flip with the OS appearance,
// so a single theme object covers both light and dark without branching on colorScheme.
const navigationThemeColors: Theme['colors'] = {
  primary: colors.blue,
  background: colors.background,
  card: colors.secondaryBackground,
  text: colors.label,
  border: colors.separator,
  notification: colors.red,
}

const asyncStoragePersister = createAsyncStoragePersister({ storage: AsyncStorage })
// Bump when the cached query data shape changes in a way older persisted caches can't handle.
const QUERY_CACHE_BUSTER = '1'
const PUSH_INSTALLATION_ID_KEY = 'push-installation-id'

function RootLayoutNav() {
  const { t } = useTranslation()
  const { user, loading, signupEmail, signupToken } = useAuth()
  const segments = useSegments()
  const router = useRouter()
  const qc = useQueryClient()
  const api = useApiClient()
  const { push: pushNotif } = useNotificationHistory()
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null)
  const colorScheme = useResolvedColorScheme()
  const navigationTheme = useMemo<Theme>(
    () => ({
      dark: colorScheme === 'dark',
      colors: navigationThemeColors,
      fonts: DefaultTheme.fonts,
    }),
    [colorScheme],
  )
  useImportJobs(user ? `${user.id}:${user.active_household_id ?? 'personal'}` : null)

  useEffect(() => {
    if (!user) return
    let installationId: string | null = null
    let active = true
    const register = async () => {
      const permissions = await Notifications.getPermissionsAsync()
      if (!permissions.granted) return
      installationId = await AsyncStorage.getItem(PUSH_INSTALLATION_ID_KEY)
      if (!installationId) {
        installationId = createUuid()
        await AsyncStorage.setItem(PUSH_INSTALLATION_ID_KEY, installationId)
      }
      const token = await Notifications.getDevicePushTokenAsync()
      if (active) await api.registerDevice(installationId, token.data)
    }
    void register()
    return () => {
      active = false
      if (installationId) void api.unregisterDevice(installationId)
    }
  }, [api, user?.id])

  // Handle APNs pushes from the background import worker
  useEffect(() => {
    // Foreground: add to in-app bell without navigating
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown>
      const type = data?.type as string | undefined
      const jobId = data?.job_id as string | undefined
      if (type === 'recipe_imported') {
        pushNotif({
          type: 'recipe_imported',
          title: notification.request.content.title ?? t('bell.recipeImported'),
          body: notification.request.content.body ?? t('bell.recipeImportedBody'),
          recipe_id: data.recipe_id as string | undefined,
          job_id: jobId,
        })
        qc.invalidateQueries()
      } else if (type === 'recipe_failed') {
        pushNotif({
          type: 'recipe_failed',
          title: notification.request.content.title ?? t('bell.recipeImportFailed'),
          body: notification.request.content.body ?? t('bell.recipeImportFailedBody'),
          job_id: jobId,
        })
      }
    })

    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>
      const type = data?.type as string | undefined
      const jobId = data?.job_id as string | undefined
      if (type === 'recipe_imported') {
        pushNotif({
          type: 'recipe_imported',
          title: response.notification.request.content.title ?? t('bell.recipeImported'),
          body: response.notification.request.content.body ?? t('bell.recipeImportedBody'),
          recipe_id: data.recipe_id as string | undefined,
          job_id: jobId,
        })
        if (data.recipe_id) {
          router.push(`/recipe/${data.recipe_id as string}`)
        }
      } else if (type === 'recipe_failed') {
        pushNotif({
          type: 'recipe_failed',
          title: response.notification.request.content.title ?? t('bell.recipeImportFailed'),
          body: response.notification.request.content.body ?? t('bell.recipeImportFailedBody'),
          job_id: jobId,
        })
      }
    })
    return () => {
      receivedSub.remove()
      responseListenerRef.current?.remove()
    }
  }, [pushNotif, qc, router, t])

  useEffect(() => {
    if (loading) return
    const inAuth = segments[0] === '(auth)'
    const inVerify = segments.includes('verify')
    const inCompleteProfile = segments.includes('complete-profile')
    if (!user && signupToken && !inCompleteProfile) {
      router.replace('/(auth)/complete-profile')
    } else if (!user && signupEmail && !signupToken && !inVerify) {
      router.replace('/(auth)/verify')
    } else if (!user && !signupEmail && !signupToken && !inAuth) {
      router.replace('/(auth)/login')
    } else if (user && inAuth) {
      router.replace('/(tabs)')
    }
  }, [user, loading, signupEmail, signupToken, segments])

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
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerBackTitle: t('common.back'),
          headerTransparent: true,
          headerShadowVisible: false,
          headerTitleAlign: 'left',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="share" options={{ animation: 'none', headerShown: false }} />
        <Stack.Screen
          name="new-recipe"
          options={{
            headerTitle: () => <HeaderTitle title={t('addRecipe.addRecipe')} />,
            headerRight: () => <BugReportButton />,
          }}
        />
        <Stack.Screen
          name="webview-import"
          options={{ headerTitle: () => <HeaderTitle title={t('addRecipe.webviewTitle')} /> }}
        />
        <Stack.Screen name="recipe/[id]" options={{ title: '', headerRight: () => <BugReportButton /> }} />
        <Stack.Screen name="household/[id]" options={{ title: '', headerRight: () => <BugReportButton /> }} />
        <Stack.Screen name="bug-report" options={{ presentation: 'modal' }} />
      </Stack>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" />
        </View>
      )}
    </ThemeProvider>
  )
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
})

const RootLayout = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <ColorSchemeProvider>
          <CookingModeProvider>
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={{
                persister: asyncStoragePersister,
                maxAge: 24 * 60 * 60 * 1000,
                buster: QUERY_CACHE_BUSTER,
              }}
            >
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
            </PersistQueryClientProvider>
          </CookingModeProvider>
        </ColorSchemeProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  )
}

export default __DEV__ ? RootLayout : Sentry.wrap(RootLayout)
