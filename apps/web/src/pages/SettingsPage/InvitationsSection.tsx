import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, toast } from '@heroui/react'
import type { InvitationOut } from '@carrot/shared/types'
import { acceptInvitation, declineInvitation } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useHousehold } from '../../context/HouseholdContext'

interface InvitationRowProps {
  invitation: InvitationOut
  busy: boolean
  onAccept: (invitation: InvitationOut) => void
  onDecline: (invitation: InvitationOut) => void
}

const InvitationRow = ({
  invitation,
  busy,
  onAccept,
  onDecline,
}: InvitationRowProps) => {
  const { t } = useTranslation()
  const inviter = invitation.invited_by_nickname || invitation.invited_by_email

  const handleAccept = useCallback(
    () => onAccept(invitation),
    [invitation, onAccept]
  )
  const handleDecline = useCallback(
    () => onDecline(invitation),
    [invitation, onDecline]
  )

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {invitation.household_name}
        </p>
        <p className="text-xs text-zinc-400 truncate">
          {t('invitations.invitedBy', { name: inviter })}
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        isDisabled={busy}
        onPress={handleDecline}
        aria-label={`${t('common.decline')}: ${invitation.household_name}`}
      >
        {t('common.decline')}
      </Button>
      <Button
        size="sm"
        variant="primary"
        isDisabled={busy}
        onPress={handleAccept}
        aria-label={`${t('common.accept')}: ${invitation.household_name}`}
      >
        {t('common.accept')}
      </Button>
    </li>
  )
}

const InvitationsSection = () => {
  const { t } = useTranslation()
  const { invitations, refetchInvitations, refetchHouseholds } = useHousehold()
  const { refreshUser } = useAuth()
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())

  const markBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(id)
      else next.delete(id)

      return next
    })
  }, [])

  const handleAccept = useCallback(
    async ({ id }: InvitationOut) => {
      markBusy(id, true)

      try {
        await acceptInvitation(id)
        await refreshUser()
        refetchInvitations()
        refetchHouseholds()
        toast.success(t('invitations.joinedHousehold'), { timeout: 3000 })
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : t('invitations.acceptFailed')
        toast.danger(errorMessage, { timeout: 3000 })
      } finally {
        markBusy(id, false)
      }
    },
    [markBusy, refreshUser, refetchInvitations, refetchHouseholds, t]
  )

  const handleDecline = useCallback(
    async ({ id, household_name }: InvitationOut) => {
      markBusy(id, true)

      try {
        await declineInvitation(id)
        refetchInvitations()
        toast.success(
          t('invitations.declinedHouseholdTitle', { name: household_name }),
          { timeout: 3000 }
        )
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : t('invitations.declineFailed')
        toast.danger(errorMessage, { timeout: 3000 })
      } finally {
        markBusy(id, false)
      }
    },
    [markBusy, refetchInvitations, t]
  )

  if (invitations.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('invitations.sectionTitle')}
      </h2>
      <ul className="flex flex-col gap-2">
        {invitations.map((invitation) => (
          <InvitationRow
            key={invitation.id}
            invitation={invitation}
            busy={busyIds.has(invitation.id)}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        ))}
      </ul>
    </section>
  )
}

export default InvitationsSection
