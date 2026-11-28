import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { InvitationOut } from '@carrot/shared/types'
import { SectionHeader, SettingsGroup, SettingsRow } from '../../components/ui'

interface InvitationRowProps {
  invitation: InvitationOut
  pending: boolean
  onPress: (invitation: InvitationOut) => void
}

const InvitationRow = memo(({ invitation, pending, onPress }: InvitationRowProps) => {
  const { t } = useTranslation()
  const inviter = invitation.invited_by_nickname || invitation.invited_by_email
  const handlePress = useCallback(() => onPress(invitation), [invitation, onPress])

  return (
    <SettingsRow
      title={invitation.household_name}
      subtitle={t('invitations.invitedBy', { name: inviter })}
      accessory="chevron"
      loading={pending}
      onPress={handlePress}
      accessibilityLabel={t('invitations.title', { name: invitation.household_name })}
    />
  )
})

interface InvitationsSectionProps {
  invitations: InvitationOut[]
  pendingIds: ReadonlySet<string>
  onPress: (invitation: InvitationOut) => void
}

const InvitationsSection = ({ invitations, pendingIds, onPress }: InvitationsSectionProps) => {
  const { t } = useTranslation()

  return (
    <>
      <SectionHeader variant="caption" title={t('invitations.sectionTitle')} />
      <SettingsGroup animated>
        {invitations.map((invitation) => (
          <InvitationRow
            key={invitation.id}
            invitation={invitation}
            pending={pendingIds.has(invitation.id)}
            onPress={onPress}
          />
        ))}
      </SettingsGroup>
    </>
  )
}

export default InvitationsSection
