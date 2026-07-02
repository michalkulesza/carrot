import { Dimensions } from 'react-native'
import { captureScreen } from 'react-native-view-shot'

let pendingCapture: Promise<string | undefined> | null = null

export const startBugReportScreenshot = () => {
  pendingCapture = captureScreen({
    format: 'jpg',
    quality: 0.5,
    result: 'base64',
    width: Math.round(Dimensions.get('window').width),
  }).catch(() => undefined)
}

export const takeBugReportScreenshot = (): Promise<string | undefined> | null => {
  const capture = pendingCapture
  pendingCapture = null
  return capture
}
