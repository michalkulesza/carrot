import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  listHouseholds,
  listInvitations,
  switchHousehold as apiSwitch,
  type HouseholdOut,
  type InvitationOut,
} from '../api/client'
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

interface HouseholdProviderProps {
  children: ReactNode
  onContextSwitch?: () => void
}

export function HouseholdProvider({
  children,
  onContextSwitch,
}: HouseholdProviderProps) {
  const { user, refreshUser } = useAuth()
  const [households, setHouseholds] = useState<HouseholdOut[]>([])
  const [invitations, setInvitations] = useState<InvitationOut[]>([])

  const activeHouseholdId = user?.active_household_id ?? null
  const activeHousehold =
    households.find((h) => h.id === activeHouseholdId) ?? null

  const refetchHouseholds = useCallback(() => {
    listHouseholds()
      .then(setHouseholds)
      .catch(() => {})
  }, [])

  const refetchInvitations = useCallback(() => {
    listInvitations()
      .then(setInvitations)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (user) {
      refetchHouseholds()
      refetchInvitations()
    }
  }, [user?.id])

  // Poll for new invitations every 30 seconds
  useEffect(() => {
    if (!user) return
    const id = setInterval(refetchInvitations, 30_000)

    return () => clearInterval(id)
  }, [user?.id, refetchInvitations])

  async function switchHousehold(id: string | null) {
    await apiSwitch(id)
    await refreshUser()
    onContextSwitch?.()
  }

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

export function useHousehold() {
  const ctx = useContext(HouseholdContext)
  if (!ctx)
    throw new Error('useHousehold must be used within HouseholdProvider')

  return ctx
}
