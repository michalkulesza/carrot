import '../src/i18n'
import '../src/lib/notificationHandler'
import '../src/lib/backgroundNotificationTask'
import i18n from '../src/i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native'
import { Redirect, Stack, useRouter, useSegments } from 'expo-router'
import { DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native'
import * as Sentry from '@sentry/react-native'
import * as Notifications from 'expo-notifications'
import { useIsRestoring, useQuery, useQueryClient } from '@tanstack/react-query'
import DeviceHtmlCaptureHost from '../src/components/DeviceHtmlCapture'
import HeaderTitle from '../src/components/HeaderTitle'
import { colors } from '../src/theme/colors'
import { resolveSheetCornerRadius } from '../src/components/ui/useSheetCornerRadius'
import { useResolvedColorScheme } from '../src/context/ColorSchemeContext'

const sentryEnvironment = __DEV__ ? 'development' : 'production'

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: sentryEnvironment,
  tracesSampleRate: 1.0,
})
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { I18nextProvider } from 'react-i18next'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { ApiClientProvider, useApiClient } from '@carrot/shared/api/context'
import { useImportJobs } from '@carrot/shared/hooks/useImportJobs'
import type { ImportJob } from '@carrot/shared/types'
import { AuthProvider, useAuth } from '../src/context/AuthContext'
import { usePushRegistration } from '../src/hooks/usePushRegistration'
import { useNotificationReconcile } from '../src/hooks/useNotificationReconcile'
import { dismissPresentedByCollapseId } from '../src/lib/presentedNotifications'
import { getNotificationDestination } from '../src/lib/notificationDestination'
import { TimerProvider } from '../src/context/TimerContext'
import { HouseholdProvider } from '../src/context/HouseholdContext'
import { ColorSchemeProvider, useAppLaunch } from '../src/context/ColorSchemeContext'
import { CookingModeProvider } from '../src/context/CookingModeContext'
import { mobileClient } from '../src/api/client'
import { configureGoogleSignin } from '../src/utils/googleAuth'

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

const NewRecipeHeaderTitle = () => {
  const { t } = useTranslation()

  return <HeaderTitle title={t('addRecipe.addRecipe')} />
}

const renderNewRecipeHeaderTitle = () => <NewRecipeHeaderTitle />

const WebViewImportHeaderTitle = () => {
  const { t } = useTranslation()

  return <HeaderTitle title={t('addRecipe.webviewTitle')} />
}

const renderWebViewImportHeaderTitle = () => <WebViewImportHeaderTitle />

const authScreenOptions = { headerShown: false }
const tabsScreenOptions = { headerShown: false }
const shareScreenOptions = { animation: 'none' as const, headerShown: false }
const newRecipeScreenOptions = { headerTitle: renderNewRecipeHeaderTitle }
const webViewImportScreenOptions = { headerTitle: renderWebViewImportHeaderTitle }
const detailScreenOptions = { title: '' }

// Keeps one recipe screen per id, so deep links (Live Activity, notifications) reuse it instead of stacking a copy.
const getRecipeScreenId = (_name: string, params: Record<string, unknown>) =>
  typeof params.id === 'string' ? params.id : undefined
const cookScreenOptions = { presentation: 'fullScreenModal' as const, headerShown: false }
const bugReportScreenOptions = { presentation: 'modal' as const }

const asyncStoragePersister = createAsyncStoragePersister({ storage: AsyncStorage })
// Bump when the cached query data shape changes in a way older persisted caches can't handle.
const QUERY_CACHE_BUSTER = '1'
const RECIPE_WAIT_TIMEOUT_MS = 3_000

// Everything the app can miss while backgrounded — notably recipes saved by the
// Share Extension. Semantic search is excluded on purpose: its results are derived
// from a query the user may have moved on from, and refetching re-runs an
// embeddings search server-side.
const FOREGROUND_REFRESH_DOMAINS = new Set([
  'recipes',
  'mealPlan',
  'shopping-list',
  'tags',
  'households',
  'invitations',
  'preferences',
  'importJobs',
])

const AppStartupGate = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth()
  const { isAppearanceReady, revealApp } = useAppLaunch()
  const api = useApiClient()
  const isRestoring = useIsRestoring()
  const hasRevealedRef = useRef(false)
  const [recipeWaitElapsed, setRecipeWaitElapsed] = useState(false)
  const { isLoading: isLoadingRecipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: api.listRecipes,
    enabled: isAppearanceReady && !isRestoring && !authLoading && user !== null,
    retry: 1,
  })

  // Waiting on recipes only avoids a flash of empty list; it must never be able to
  // strand the user on the splash when the API is slow or unreachable.
  useEffect(() => {
    const timer = setTimeout(() => setRecipeWaitElapsed(true), RECIPE_WAIT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    void resolveSheetCornerRadius()
  }, [])

  const isReady =
    isAppearanceReady &&
    !isRestoring &&
    !authLoading &&
    (user === null || !isLoadingRecipes || recipeWaitElapsed)

  useEffect(() => {
    if (!isReady || hasRevealedRef.current) return

    hasRevealedRef.current = true
    revealApp()
  }, [isReady, revealApp])

  return children
}

const AllergenRecheckSync = ({ scopeKey }: { scopeKey: string }) => {
  const api = useApiClient()
  const qc = useQueryClient()
  const previousStatusRef = useRef<{ completed: number; done: boolean } | null>(null)
  const { data: status } = useQuery({
    queryKey: ['allergen-recheck-status', scopeKey],
    queryFn: api.getAllergenRecheckStatus,
    refetchInterval: (query) => query.state.data?.done === false ? 1_000 : 15_000,
  })

  useEffect(() => {
    if (!status) return
    const previous = previousStatusRef.current
    previousStatusRef.current = { completed: status.completed, done: status.done }
    if (
      previous === null ||
      status.completed < previous.completed ||
      (previous.done && !status.done) ||
      status.completed > previous.completed ||
      (!previous.done && status.done)
    ) {
      void qc.invalidateQueries({ queryKey: ['recipes'] })
    }
  }, [qc, status])

  return null
}

function RootLayoutNav() {
  const { t } = useTranslation()
  const { user, loading, signupEmail, signupToken } = useAuth()
  const segments = useSegments()
  const router = useRouter()
  const qc = useQueryClient()
  const handledNotificationResponseIdsRef = useRef(new Set<string>())
  const colorScheme = useResolvedColorScheme()
  const navigationTheme = useMemo<Theme>(
    () => ({
      dark: colorScheme === 'dark',
      colors: navigationThemeColors,
      fonts: DefaultTheme.fonts,
    }),
    [colorScheme],
  )
  const rootStackScreenOptions = useMemo(
    () => ({
      headerBackTitle: t('common.back'),
      headerTransparent: true,
      headerShadowVisible: false,
      headerTitleAlign: 'left' as const,
      headerTitleStyle: { color: colorScheme === 'dark' ? '#ffffff' : '#000000' },
      headerTintColor: colorScheme === 'dark' ? '#ffffff' : '#000000',
    }),
    [colorScheme, t],
  )
  const handleImportSnapshot = useNotificationReconcile(user?.id)
  const handleImportJobEvent = useCallback((event: { type: string; job: ImportJob }) => {
    if (event.type === 'import_job.failed') return

    void dismissPresentedByCollapseId(`import:${event.job.id}`)
  }, [])
  useImportJobs(
    user ? `${user.id}:${user.active_household_id ?? 'personal'}` : null,
    handleImportJobEvent,
    handleImportSnapshot,
  )
  usePushRegistration(user?.id)

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const { identifier, content } = response.notification.request
      if (handledNotificationResponseIdsRef.current.has(identifier)) return

      const destination = getNotificationDestination(content.data as Record<string, unknown> | undefined)
      if (!destination) return

      handledNotificationResponseIdsRef.current.add(identifier)
      router.push(destination)
    }

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined
      if (data?.type === 'recipe_imported') void qc.invalidateQueries()
    })
    const responseSub = Notifications.addNotificationResponseReceivedListener(handleResponse)

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return

      handleResponse(response)
      void Notifications.clearLastNotificationResponseAsync()
    })

    return () => {
      receivedSub.remove()
      responseSub.remove()
    }
  }, [qc, router])

  // Refresh externally-changed data when the app returns to the foreground so it
  // appears without a manual pull-to-refresh.
  useEffect(() => {
    if (loading || !user) return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      void qc.invalidateQueries({
        predicate: (query) => {
          const [domain, subKey] = query.queryKey as [string, string?]
          if (domain === 'recipes' && subKey === 'semantic-search') return false
          return FOREGROUND_REFRESH_DOMAINS.has(domain)
        },
      })
    })
    return () => subscription.remove()
  }, [loading, user, qc])

  if (loading) {
    return null
  }

  const inAuth = segments[0] === '(auth)'
  const inVerify = segments.includes('verify')
  const inCompleteProfile = segments.includes('complete-profile')

  if (!user && signupToken && !inCompleteProfile) {
    return <Redirect href="/(auth)/complete-profile" />
  }

  if (!user && signupEmail && !signupToken && !inVerify) {
    return <Redirect href="/(auth)/verify" />
  }

  if (!user && !signupEmail && !signupToken && !inAuth) {
    return <Redirect href="/(auth)/login" />
  }

  if (user && inAuth) {
    return <Redirect href="/(tabs)" />
  }

  return (
    <ThemeProvider value={navigationTheme}>
      {user?.active_household_id ? (
        <AllergenRecheckSync
          scopeKey={`${user.id}:${user.active_household_id}`}
        />
      ) : null}
      {user ? <DeviceHtmlCaptureHost /> : null}
      <Stack
        screenOptions={rootStackScreenOptions}
      >
        <Stack.Screen name="(auth)" options={authScreenOptions} />
        <Stack.Screen name="(tabs)" options={tabsScreenOptions} />
        <Stack.Screen name="share" options={shareScreenOptions} />
        <Stack.Screen name="new-recipe" options={newRecipeScreenOptions} />
        <Stack.Screen name="webview-import" options={webViewImportScreenOptions} />
        <Stack.Screen
          name="recipe/[id]"
          options={detailScreenOptions}
          dangerouslySingular={getRecipeScreenId}
        />
        <Stack.Screen
          name="recipe/[id]/cook"
          options={cookScreenOptions}
          dangerouslySingular={getRecipeScreenId}
        />
        <Stack.Screen name="household/[id]" options={detailScreenOptions} />
        <Stack.Screen name="bug-report" options={bugReportScreenOptions} />
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

const AuthenticatedApp = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={styles.loadingOverlay}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    user ? (
      <TimerProvider>
        <HouseholdProvider>
          <RootLayoutNav />
        </HouseholdProvider>
      </TimerProvider>
    ) : (
      <RootLayoutNav />
    )
  )
}

const RootLayout = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ColorSchemeProvider>
        <BottomSheetModalProvider>
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
                    <AppStartupGate>
                      <AuthenticatedApp />
                    </AppStartupGate>
                  </AuthProvider>
                </ApiClientProvider>
              </I18nextProvider>
            </PersistQueryClientProvider>
          </CookingModeProvider>
        </BottomSheetModalProvider>
      </ColorSchemeProvider>
    </GestureHandlerRootView>
  )
}

export default __DEV__ ? RootLayout : Sentry.wrap(RootLayout)
