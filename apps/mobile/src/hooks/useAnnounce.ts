import { useEffect } from 'react'
import { AccessibilityInfo } from 'react-native'

export const useAnnounce = (message: string | null | undefined) => {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message)
  }, [message])
}
