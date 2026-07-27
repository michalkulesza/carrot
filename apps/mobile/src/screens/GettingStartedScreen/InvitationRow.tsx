import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import type { InvitationOut } from '@carrot/shared/types'
import { styles } from './styles'

const InvitationRow = ({
  invitation,
  busy,
  bordered,
  onAccept,
}: {
  invitation: InvitationOut
  busy: boolean
  bordered: boolean
  onAccept: (id: string) => void
}) => {
  const { t } = useTranslation()

  return (
    <View style={[styles.invitationRow, bordered && styles.invitationRowBorder]}>
      <View style={styles.invitationInfo}>
        <Text style={styles.invitationHouseholdName} numberOfLines={1}>
          {invitation.household_name}
        </Text>
        <Text style={styles.invitationFrom} numberOfLines={1}>
          {t('bell.from', { name: invitation.invited_by_nickname || invitation.invited_by_email })}
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.invitationAcceptBtn, pressed && { opacity: 0.8 }]}
        disabled={busy}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onAccept(invitation.id)
        }}
        accessibilityLabel={t('common.accept')}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.invitationAcceptBtnText}>{t('common.accept')}</Text>
        )}
      </Pressable>
    </View>
  )
}

export default InvitationRow
