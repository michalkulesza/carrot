import { useCallback, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useApiClient } from '@carrot/shared/api/context'
import type { InvitationOut } from '@carrot/shared/types'
import { useAuth } from '../../context/AuthContext'
import { useHousehold } from '../../context/HouseholdContext'

export const useInvitationActions = () => {
  const { t } = useTranslation()
  const api = useApiClient()
  const { refreshUser } = useAuth()
  const { refetchHouseholds, refetchInvitations } = useHousehold()
  const inFlightIdsRef = useRef(new Set<string>())
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())

  const runInvitationAction = useCallback(
    async (invitation: InvitationOut, action: () => Promise<void>, fallbackError: string) => {
      if (inFlightIdsRef.current.has(invitation.id)) return

      inFlightIdsRef.current.add(invitation.id)
      setPendingIds(new Set(inFlightIdsRef.current))

      try {
        await action()
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } catch (e) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : fallbackError)
      } finally {
        inFlightIdsRef.current.delete(invitation.id)
        setPendingIds(new Set(inFlightIdsRef.current))
      }
    },
    [t],
  )

  const acceptInvitation = useCallback(
    (invitation: InvitationOut) =>
      runInvitationAction(
        invitation,
        async () => {
          await api.acceptInvitation(invitation.id)
          await refreshUser()
          refetchInvitations()
          refetchHouseholds()
        },
        t('invitations.acceptFailed'),
      ),
    [api, refetchHouseholds, refetchInvitations, refreshUser, runInvitationAction, t],
  )

  const declineInvitation = useCallback(
    (invitation: InvitationOut) =>
      runInvitationAction(
        invitation,
        async () => {
          await api.declineInvitation(invitation.id)
          refetchInvitations()
        },
        t('invitations.declineFailed'),
      ),
    [api, refetchInvitations, runInvitationAction, t],
  )

  const handleInvitationPress = useCallback(
    (invitation: InvitationOut) => {
      if (inFlightIdsRef.current.has(invitation.id)) return

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const inviter = invitation.invited_by_nickname || invitation.invited_by_email

      Alert.alert(t('invitations.title', { name: invitation.household_name }), t('invitations.from', { name: inviter }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.decline'), style: 'destructive', onPress: () => void declineInvitation(invitation) },
        { text: t('common.accept'), onPress: () => void acceptInvitation(invitation) },
      ])
    },
    [acceptInvitation, declineInvitation, t],
  )

  return { pendingIds, handleInvitationPress }
}
