import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import type { ImportJob, InvitationOut } from '@carrot/shared/types'
import {
  reconcileImportNotifications,
  reconcileInvitationNotifications,
} from '../lib/presentedNotifications'

const IMPORT_JOBS_KEY = ['importJobs']
const INVITATIONS_KEY = ['invitations']

export const useNotificationReconcile = (userId: string | undefined) => {
  const api = useApiClient()
  const qc = useQueryClient()
  const importSnapshotReadyRef = useRef(false)
  const { data: invitations, isSuccess: invitationsLoaded } = useQuery({
    queryKey: INVITATIONS_KEY,
    queryFn: api.listInvitations,
    enabled: Boolean(userId),
  })

  useEffect(() => {
    importSnapshotReadyRef.current = false
  }, [userId])

  useEffect(() => {
    if (invitationsLoaded) void reconcileInvitationNotifications(invitations)
  }, [invitations, invitationsLoaded])

  useEffect(() => {
    if (!userId) return

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return

      if (importSnapshotReadyRef.current) {
        void reconcileImportNotifications(qc.getQueryData<ImportJob[]>(IMPORT_JOBS_KEY) ?? [])
      }
      void qc
        .refetchQueries({ queryKey: INVITATIONS_KEY })
        .then(() => {
          const pending = qc.getQueryData<InvitationOut[]>(INVITATIONS_KEY)
          if (pending) void reconcileInvitationNotifications(pending)
        })
        .catch(() => {})
    })

    return () => subscription.remove()
  }, [qc, userId])

  return useCallback((jobs: ImportJob[]) => {
    importSnapshotReadyRef.current = true
    void reconcileImportNotifications(jobs)
  }, [])
}
