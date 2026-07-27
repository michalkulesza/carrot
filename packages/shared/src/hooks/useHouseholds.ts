import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'

export const useHouseholds = () => {
  const api = useApiClient()
  const qc = useQueryClient()

  const query = useQuery({ queryKey: ['households'], queryFn: api.listHouseholds })

  const create = useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      api.createHousehold(name, color),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      api.updateHousehold(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  })

  const leave = useMutation({
    mutationFn: api.leaveHousehold,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  })

  const joinByCode = useMutation({
    mutationFn: (code: string) => api.joinHouseholdByCode(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  })

  const rotateCode = useMutation({
    mutationFn: (householdId: string) => api.rotateInviteCode(householdId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  })

  const switchTo = useMutation({
    mutationFn: (id: string | null) => api.switchHousehold(id),
  })

  const invite = useMutation({
    mutationFn: ({ householdId, email }: { householdId: string; email: string }) =>
      api.inviteUser(householdId, email),
  })

  const updateAllergens = useMutation({
    mutationFn: ({ householdId, allergens }: { householdId: string; allergens: string[] }) =>
      api.updateHouseholdAllergens(householdId, allergens),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['households'] }),
  })

  return {
    households: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create,
    update,
    leave,
    joinByCode,
    rotateCode,
    switchTo,
    invite,
    updateAllergens,
  }
}
