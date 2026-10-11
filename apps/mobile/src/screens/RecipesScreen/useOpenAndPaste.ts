import { useCallback, useEffect, useRef } from 'react'
import { AppState, Linking, type NativeEventSubscription } from 'react-native'

export const useOpenAndPaste = (presentTextImport: () => void) => {
  const subscriptionRef = useRef<NativeEventSubscription | null>(null)

  const clearSubscription = useCallback(() => {
    subscriptionRef.current?.remove()
    subscriptionRef.current = null
  }, [])

  useEffect(() => clearSubscription, [clearSubscription])

  return useCallback(
    async (sourceUrl: string | null) => {
      clearSubscription()
      if (!sourceUrl) {
        presentTextImport()
        return
      }

      let leftApp = false
      subscriptionRef.current = AppState.addEventListener('change', (state) => {
        if (state !== 'active') {
          leftApp = true
          return
        }
        if (!leftApp) return

        clearSubscription()
        presentTextImport()
      })

      try {
        await Linking.openURL(sourceUrl)
      } catch {
        clearSubscription()
        presentTextImport()
      }
    },
    [clearSubscription, presentTextImport],
  )
}
