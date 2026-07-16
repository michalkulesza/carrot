import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, PlatformColor, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { WebView } from 'react-native-webview'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import { enqueueImport } from '../utils/enqueueImport'

// Keep well under the backend's extraction cap so the page text doesn't blow up route params.
const MAX_EXTRACTED_CHARS = 8000

const EXTRACT_SCRIPT = `
(function() {
  var text = document.body ? document.body.innerText : '';
  window.ReactNativeWebView.postMessage(text.slice(0, ${MAX_EXTRACTED_CHARS}));
})();
true;
`

const ExtractButton = ({
  pageLoaded,
  extracting,
  onPress,
  accessibilityLabel,
}: {
  pageLoaded: boolean
  extracting: boolean
  onPress: () => void
  accessibilityLabel: string
}) => {
  if (extracting) return <ActivityIndicator size="small" />
  const iconColor = (
    pageLoaded ? PlatformColor('systemBlue') : PlatformColor('tertiaryLabel')
  ) as unknown as string
  return (
    <Pressable
      onPress={onPress}
      disabled={!pageLoaded}
      hitSlop={8}
      style={({ pressed }) => [pressed && { opacity: 0.6 }]}
      accessibilityLabel={accessibilityLabel}
    >
      <Feather name="check" size={22} color={iconColor} />
    </Pressable>
  )
}

const WebViewImportScreen = () => {
  const { url } = useLocalSearchParams<{ url?: string }>()
  const navigation = useNavigation()
  const router = useRouter()
  const { t } = useTranslation()
  const api = useApiClient()
  const qc = useQueryClient()
  const webViewRef = useRef<WebView>(null)
  const [pageLoaded, setPageLoaded] = useState(false)
  const [extracting, setExtracting] = useState(false)

  const handleExtract = useCallback(() => {
    setExtracting(true)
    webViewRef.current?.injectJavaScript(EXTRACT_SCRIPT)
  }, [])

  const handleMessage = useCallback(
    async (event: { nativeEvent: { data: string } }) => {
      const text = event.nativeEvent.data.trim()
      if (!text) {
        setExtracting(false)
        return
      }
      try {
        await enqueueImport(api, qc, 'text', { text })
        router.replace('/(tabs)/recipes')
      } catch (err) {
        setExtracting(false)
        Alert.alert(t('addRecipe.importFailed'), err instanceof Error ? err.message : t('importJobs.enqueueFailed'))
      }
    },
    [api, qc, router, t]
  )

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('addRecipe.webviewTitle'),
      headerRight: () => (
        <ExtractButton
          pageLoaded={pageLoaded}
          extracting={extracting}
          onPress={handleExtract}
          accessibilityLabel={t('addRecipe.useThisPage')}
        />
      ),
    })
  }, [navigation, t, pageLoaded, extracting, handleExtract])

  if (!url) return null

  return (
    <View style={styles.flex}>
      <View style={styles.hintBar}>
        <Text style={styles.hintText}>{t('addRecipe.webviewHint')}</Text>
      </View>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.flex}
        onLoadEnd={() => setPageLoaded(true)}
        onMessage={handleMessage}
        accessibilityLabel={t('addRecipe.webviewTitle')}
        // Never set `incognito` here — it forces a non-persistent WKWebsiteDataStore/
        // CookieManager session, which would make the user log in again on every import.
        // Leaving it unset (with cacheEnabled, the default) keeps logins on-disk and
        // shared across app launches, so a site only needs to be logged into once.
        cacheEnabled
      />
    </View>
  )
}

export default WebViewImportScreen

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hintBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: PlatformColor('secondarySystemBackground') as unknown as string,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor('separator') as unknown as string,
  },
  hintText: {
    fontSize: 13,
    lineHeight: 18,
    color: PlatformColor('secondaryLabel') as unknown as string,
  },
})
