import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../api/context'

export const useInvitations = (refetchIntervalMs = 30_000) => {
  const api = useApiClient()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['invitations'],
    queryFn: api.listInvitations,
    refetchInterval: refetchIntervalMs,
  })

  const accept = useMutation({
    mutationFn: api.acceptInvitation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations'] })
      qc.invalidateQueries({ queryKey: ['households'] })
    },
  })

  const decline = useMutation({
    mutationFn: api.declineInvitation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  })

  return {
    invitations: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    accept,
    decline,
  }
}
