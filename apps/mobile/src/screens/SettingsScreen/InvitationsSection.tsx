import { memo, useCallback } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { InvitationOut } from '@carrot/shared/types'
import { styles } from './styles'

const getPressableStyle = (pressed: boolean, bordered: boolean) => [
  styles.householdRow,
  bordered && styles.householdRowBorder,
  pressed && { opacity: 0.7 },
]

const InvitationRow = memo(
  ({
    invitation,
    pending,
    bordered,
    onPress,
  }: {
    invitation: InvitationOut
    pending: boolean
    bordered: boolean
    onPress: (invitation: InvitationOut) => void
  }) => {
    const { t } = useTranslation()
    const inviter = invitation.invited_by_nickname || invitation.invited_by_email
    const handlePress = useCallback(() => onPress(invitation), [invitation, onPress])
    const getStyle = useCallback(
      ({ pressed }: { pressed: boolean }) => getPressableStyle(pressed, bordered),
      [bordered],
    )

    return (
      <Pressable
        style={getStyle}
        onPress={handlePress}
        disabled={pending}
        hitSlop={4}
        accessibilityLabel={t('invitations.title', { name: invitation.household_name })}
        accessibilityRole="button"
      >
        <View style={styles.householdInfo}>
          <Text style={styles.householdName} numberOfLines={1}>
            {invitation.household_name}
          </Text>
          <Text style={styles.invitationFrom} numberOfLines={1}>
            {t('invitations.invitedBy', { name: inviter })}
          </Text>
        </View>
        {pending ? <ActivityIndicator size="small" /> : <Text style={styles.pickerChevron}>›</Text>}
      </Pressable>
    )
  },
)

const InvitationsSection = ({
  invitations,
  pendingIds,
  onPress,
}: {
  invitations: InvitationOut[]
  pendingIds: ReadonlySet<string>
  onPress: (invitation: InvitationOut) => void
}) => (
  <View style={styles.card}>
    {invitations.map((invitation, index) => (
      <InvitationRow
        key={invitation.id}
        invitation={invitation}
        pending={pendingIds.has(invitation.id)}
        bordered={index < invitations.length - 1}
        onPress={onPress}
      />
    ))}
  </View>
)

export default InvitationsSection
