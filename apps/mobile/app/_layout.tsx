import '../src/i18n'
import i18n from '../src/i18n'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import * as Sentry from '@sentry/react-native'
import * as Notifications from 'expo-notifications'
import { useQueryClient } from '@tanstack/react-query'
import { consumePendingShare, hasPendingShare } from '../src/utils/pendingShare'
import { useNotificationHistory } from '../src/context/NotificationHistoryContext'

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
import { ApiClientProvider, useApiClient } from '@platekeeper/shared/api/context'
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
  const api = useApiClient()
  const { push: pushNotif, dismiss: dismissNotif, items: notifItems } = useNotificationHistory()
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null)
  // Stable ref so the polling interval doesn't need to re-register when items change
  const notifItemsRef = useRef(notifItems)
  useEffect(() => { notifItemsRef.current = notifItems }, [notifItems])

  // Poll job status while any recipe_importing entry is in the bell.
  // This is the primary completion signal — APNs is a bonus if configured.
  useEffect(() => {
    if (!user) return
    const id = setInterval(async () => {
      const pending = notifItemsRef.current.filter((n) => n.type === 'recipe_importing' && n.job_id)
      if (!pending.length) return
      for (const notif of pending) {
        try {
          const job = await api.getImportJob(notif.job_id!)
          if (job.status === 'succeeded' && job.result_recipe_id) {
            dismissNotif(notif.id)
            pushNotif({
              type: 'recipe_imported',
              title: t('bell.recipeImported'),
              body: t('bell.recipeImportedBody'),
              recipe_id: job.result_recipe_id,
              job_id: job.id,
            })
            qc.invalidateQueries()
          } else if (job.status === 'failed') {
            dismissNotif(notif.id)
            pushNotif({
              type: 'recipe_failed',
              title: t('bell.recipeImportFailed'),
              body: job.error ?? t('bell.recipeImportFailedBody'),
              job_id: job.id,
              job_kind: notif.job_kind,
              job_input: notif.job_input,
            })
          }
        } catch {
          // ignore transient network errors
        }
      }
    }, 3000)
    return () => clearInterval(id)
  }, [user, api, dismissNotif, pushNotif, qc, t])

  // Handle APNs pushes from the background import worker
  useEffect(() => {
    // Foreground: add to in-app bell without navigating
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown>
      const type = data?.type as string | undefined
      const jobId = data?.job_id as string | undefined
      if (type === 'recipe_imported') {
        if (jobId) {
          const pending = notifItems.find((n) => n.type === 'recipe_importing' && n.job_id === jobId)
          if (pending) dismissNotif(pending.id)
        }
        pushNotif({
          type: 'recipe_imported',
          title: notification.request.content.title ?? t('bell.recipeImported'),
          body: notification.request.content.body ?? t('bell.recipeImportedBody'),
          recipe_id: data.recipe_id as string | undefined,
          job_id: jobId,
        })
        qc.invalidateQueries()
      } else if (type === 'recipe_failed') {
        if (jobId) {
          const pending = notifItems.find((n) => n.type === 'recipe_importing' && n.job_id === jobId)
          if (pending) dismissNotif(pending.id)
        }
        pushNotif({
          type: 'recipe_failed',
          title: notification.request.content.title ?? t('bell.recipeImportFailed'),
          body: notification.request.content.body ?? t('bell.recipeImportFailedBody'),
          job_id: jobId,
          job_kind: data.job_kind as string | undefined,
          job_input: data.job_input as Record<string, string> | undefined,
        })
      }
    })

    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>
      const type = data?.type as string | undefined
      const jobId = data?.job_id as string | undefined
      if (type === 'recipe_imported') {
        if (jobId) {
          const pending = notifItems.find((n) => n.type === 'recipe_importing' && n.job_id === jobId)
          if (pending) dismissNotif(pending.id)
        }
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
        if (jobId) {
          const pending = notifItems.find((n) => n.type === 'recipe_importing' && n.job_id === jobId)
          if (pending) dismissNotif(pending.id)
        }
        pushNotif({
          type: 'recipe_failed',
          title: response.notification.request.content.title ?? t('bell.recipeImportFailed'),
          body: response.notification.request.content.body ?? t('bell.recipeImportFailedBody'),
          job_id: jobId,
          job_kind: data.job_kind as string | undefined,
          job_input: data.job_input as Record<string, string> | undefined,
        })
      }
    })
    return () => {
      receivedSub.remove()
      responseListenerRef.current?.remove()
    }
  }, [dismissNotif, notifItems, pushNotif, qc, router, t])

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
        if (!pending) return
        if (pending.type === 'job') {
          // Extension enqueued a background job — register it in the bell so the polling
          // loop picks it up and the recipe list shows a placeholder.
          pushNotif({
            type: 'recipe_importing',
            title: t('bell.recipeImporting'),
            body: t('bell.recipeImportingBody'),
            job_id: pending.job_id,
            job_kind: pending.job_kind,
            job_input: pending.job_input,
          })
        } else {
          router.push({ pathname: '/import-recipe', params: { type: pending.type, value: pending.value } })
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
