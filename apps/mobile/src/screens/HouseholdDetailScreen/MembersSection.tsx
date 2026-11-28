import { memo, useCallback, useMemo } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { MemberOut } from '@carrot/shared/types'
import Avatar from '../../components/Avatar'
import { Button, SectionHeader, SettingsGroup, SettingsRow } from '../../components/ui'
import { palette } from '../../theme'
import { memberColorFor } from './helpers'
import { styles } from './styles'

const AVATAR_SIZE = 40

interface MemberRowProps {
  member: MemberOut
  isSelf: boolean
  canEdit: boolean
  busy: boolean
  onEdit: (member: MemberOut) => void
}

const MemberRow = memo(({ member, isSelf, canEdit, busy, onEdit }: MemberRowProps) => {
  const { t } = useTranslation()
  const name = member.nickname || member.email
  const title = isSelf ? `${name} ${t('settings.memberYou')}` : name
  const subtitle = member.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleMember')
  const color = isSelf ? palette.action : memberColorFor(member.user_id)
  const handleEdit = useCallback(() => onEdit(member), [onEdit, member])

  const avatar = useMemo(() => <Avatar name={name} color={color} size={AVATAR_SIZE} />, [name, color])
  const editButton = useMemo(
    () => (canEdit ? <Button variant="surface" size="sm" label={t('common.edit')} onPress={handleEdit} /> : 'none'),
    [canEdit, t, handleEdit],
  )

  return <SettingsRow leading={avatar} title={title} subtitle={subtitle} accessory={editButton} loading={busy} />
})

interface MembersSectionProps {
  loading: boolean
  members: MemberOut[]
  isAdmin: boolean
  currentUserId: string | undefined
  busyUserId: string | null
  onEdit: (member: MemberOut) => void
}

const MembersSection = ({ loading, members, isAdmin, currentUserId, busyUserId, onEdit }: MembersSectionProps) => {
  const { t } = useTranslation()

  return (
    <>
      <SectionHeader variant="caption" title={t('settings.members')} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        </View>
      ) : (
        <SettingsGroup>
          {members.map((member) => (
            <MemberRow
              key={member.user_id}
              member={member}
              isSelf={member.user_id === currentUserId}
              canEdit={isAdmin && member.user_id !== currentUserId}
              busy={busyUserId === member.user_id}
              onEdit={onEdit}
            />
          ))}
        </SettingsGroup>
      )}
    </>
  )
}

export default memo(MembersSection)
