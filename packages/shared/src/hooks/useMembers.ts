import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'

export const useMembers = (householdId: string | null) => {
  const api = useApiClient()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['members', householdId],
    queryFn: () => api.listMembers(householdId!),
    enabled: !!householdId,
  })

  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(householdId!, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', householdId] })
      qc.invalidateQueries({ queryKey: ['households'] })
    },
  })

  const promote = useMutation({
    mutationFn: (userId: string) => api.promoteMember(householdId!, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', householdId] }),
  })

  return {
    members: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    remove,
    promote,
  }
}
