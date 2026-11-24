import { useCallback, useEffect, useRef } from 'react'
import { Alert, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'

// Lets the action sheet that triggered this finish dismissing before the bottom sheet presents.
const PRESENT_DELAY_MS = 0
// Lets the bottom sheet finish presenting before the browser backgrounds the app.
const OPEN_LINK_DELAY_MS = 300

export const useOpenAndPaste = (presentTextImport: () => void) => {
  const { t } = useTranslation()
  const inFlightRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const schedule = useCallback((run: () => void, delayMs: number) => {
    timersRef.current.push(setTimeout(run, delayMs))
  }, [])

  const openLink = useCallback(async (sourceUrl: string) => {
    try {
      await Linking.openURL(sourceUrl)
    } catch {
      Alert.alert(t('importJobs.openLinkFailed'))
    } finally {
      inFlightRef.current = false
    }
  }, [t])

  return useCallback(
    (sourceUrl: string | null) => {
      if (inFlightRef.current) return
      inFlightRef.current = true

      schedule(() => {
        presentTextImport()

        if (!sourceUrl) {
          inFlightRef.current = false
          return
        }

        schedule(() => void openLink(sourceUrl), OPEN_LINK_DELAY_MS)
      }, PRESENT_DELAY_MS)
    },
    [schedule, presentTextImport, openLink],
  )
}
