import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NativeActionEvent } from '@react-native-menu/menu'
import * as Haptics from 'expo-haptics'
import { useHousehold } from '../context/HouseholdContext'

export const useHouseholdMenu = (isFetching: boolean) => {
  const { households, activeHouseholdId, switchHousehold } = useHousehold()
  const [switchingHousehold, setSwitchingHousehold] = useState(false)
  const householdFetchStartedRef = useRef(false)

  const householdMenuActions = useMemo(
    () =>
      households.map((h) => ({
        id: h.id,
        title: h.name,
        state: 'off' as const,
        image: h.id === activeHouseholdId ? 'checkmark.circle.fill' : 'circle.fill',
        imageColor: h.color,
      })),
    [households, activeHouseholdId],
  )

  const handleHouseholdAction = useCallback(
    ({ nativeEvent }: NativeActionEvent) => {
      const id = nativeEvent.event
      if (id === activeHouseholdId) return

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      setSwitchingHousehold(true)
      householdFetchStartedRef.current = false
      switchHousehold(id).catch(() => setSwitchingHousehold(false))
    },
    [activeHouseholdId, switchHousehold],
  )

  const handleHouseholdMenuOpen = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

  // switchHousehold only awaits the API call; the recipes refetch starts later, so keep the spinner until it starts and finishes.
  useEffect(() => {
    if (!switchingHousehold) return
    if (isFetching) {
      householdFetchStartedRef.current = true
      return
    }
    if (householdFetchStartedRef.current) {
      householdFetchStartedRef.current = false
      setSwitchingHousehold(false)
    }
  }, [isFetching, switchingHousehold])

  return { householdMenuActions, handleHouseholdAction, handleHouseholdMenuOpen, switchingHousehold }
}
