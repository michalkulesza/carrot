import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { useQueryClient as useQC } from '@tanstack/react-query'
import type { HouseholdOut, InvitationOut, HouseholdLeaveNotificationOut } from '@carrot/shared/types'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { useInvitations } from '@carrot/shared/hooks/useInvitations'
import { useHouseholdLeaveNotifications } from '@carrot/shared/hooks/useHouseholdLeaveNotifications'
import { useAuth } from './AuthContext'
import { mobileClient } from '../api/client'

interface HouseholdContextValue {
  households: HouseholdOut[]
  isLoadingHouseholds: boolean
  activeHouseholdId: string | null
  activeHousehold: HouseholdOut | null
  invitations: InvitationOut[]
  leaveNotifications: HouseholdLeaveNotificationOut[]
  dismissLeaveNotification: (id: string) => void
  switchHousehold: (id: string | null) => Promise<void>
  refetchHouseholds: () => void
  refetchInvitations: () => void
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null)

export const HouseholdProvider = ({ children }: { children: ReactNode }) => {
  const { user, refreshUser } = useAuth()
  const qc = useQC()

  const { households, isLoading: isLoadingHouseholds } = useHouseholds()
  const { invitations } = useInvitations()
  const { notifications: leaveNotifications, dismiss: dismissLeaveNotificationMutation } =
    useHouseholdLeaveNotifications()

  const activeHouseholdId = user?.active_household_id ?? null
  const activeHousehold =
    households.find((h) => h.id === activeHouseholdId) ?? null

  const refetchHouseholds = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['households'] })
  }, [qc])

  const refetchInvitations = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['invitations'] })
  }, [qc])

  // Invalidate all household-scoped data when the active household changes
  const prevHouseholdId = useRef(activeHouseholdId)
  useEffect(() => {
    if (prevHouseholdId.current === activeHouseholdId) return
    prevHouseholdId.current = activeHouseholdId
    void qc.invalidateQueries({ queryKey: ['recipes'] })
    void qc.invalidateQueries({ queryKey: ['tags'] })
    void qc.invalidateQueries({ queryKey: ['recipes', 'stats'] })
    void qc.invalidateQueries({ queryKey: ['preferences'] })
    void qc.invalidateQueries({ queryKey: ['mealPlan'] })
  }, [activeHouseholdId, qc])

  const switchHousehold = useCallback(async (id: string | null) => {
    await mobileClient.switchHousehold(id)
    await refreshUser()
  }, [refreshUser])

  const dismissLeaveNotification = useCallback((id: string) => {
    dismissLeaveNotificationMutation.mutate(id)
  }, [dismissLeaveNotificationMutation])

  return (
    <HouseholdContext.Provider
      value={{
        households,
        isLoadingHouseholds,
        activeHouseholdId,
        activeHousehold,
        invitations,
        leaveNotifications,
        dismissLeaveNotification,
        switchHousehold,
        refetchHouseholds,
        refetchInvitations,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  )
}

export const useHousehold = () => {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold must be used within HouseholdProvider')
  return ctx
}
