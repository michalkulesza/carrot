import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { HIDDEN_CAPTURE_SCRIPT } from './helpers'
import { useDeviceHtmlCapture } from './useDeviceHtmlCapture'

const DeviceHtmlCaptureHost = () => {
  const { activeJob, handleMessage, handleError } = useDeviceHtmlCapture()
  if (!activeJob?.source_url) return null

  return (
    <View pointerEvents="none" style={styles.host}>
      <WebView
        key={activeJob.id}
        source={{ uri: activeJob.source_url }}
        injectedJavaScript={HIDDEN_CAPTURE_SCRIPT}
        onMessage={handleMessage}
        onError={handleError}
        cacheEnabled
        style={styles.webView}
      />
    </View>
  )
}

export default DeviceHtmlCaptureHost

const styles = StyleSheet.create({
  host: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  webView: { width: 1, height: 1 },
})
