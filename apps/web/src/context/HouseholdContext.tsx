import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { switchHousehold as apiSwitch } from '../api/client'
import type { HouseholdOut, InvitationOut } from '@carrot/shared/types'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { useInvitations } from '@carrot/shared/hooks/useInvitations'
import { useAuth } from './AuthContext'

interface HouseholdContextValue {
  households: HouseholdOut[]
  activeHouseholdId: string | null
  activeHousehold: HouseholdOut | null
  invitations: InvitationOut[]
  switchHousehold: (id: string | null) => Promise<void>
  refetchHouseholds: () => void
  refetchInvitations: () => void
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null)

export const HouseholdProvider = ({ children }: { children: ReactNode }) => {
  const { user, refreshUser } = useAuth()
  const qc = useQueryClient()

  const { households } = useHouseholds()
  const { invitations } = useInvitations()

  const activeHouseholdId = user?.active_household_id ?? null
  const activeHousehold =
    households.find((h) => h.id === activeHouseholdId) ?? null

  const refetchHouseholds = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['households'] })
  }, [qc])

  const refetchInvitations = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['invitations'] })
  }, [qc])

  const switchHousehold = useCallback(async (id: string | null) => {
    await apiSwitch(id)
    await refreshUser()
  }, [refreshUser])

  return (
    <HouseholdContext.Provider
      value={{
        households,
        activeHouseholdId,
        activeHousehold,
        invitations,
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
  if (!ctx)
    throw new Error('useHousehold must be used within HouseholdProvider')

  return ctx
}
