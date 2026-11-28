import { useCallback, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useMembers } from '@carrot/shared/hooks/useMembers'
import type { MemberOut } from '@carrot/shared/types'
import { useActionMenu } from '../../context/DialogContext'

export const useMemberActions = (householdId: string) => {
  const { t } = useTranslation()
  const { members, isLoading, remove, promote } = useMembers(householdId)
  const showActionMenu = useActionMenu()
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const busyRef = useRef(false)

  const runExclusive = useCallback(
    async (userId: string, action: () => Promise<unknown>) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusyUserId(userId)

      try {
        await action()
      } catch (e) {
        Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.failedToSave'))
      } finally {
        busyRef.current = false
        setBusyUserId(null)
      }
    },
    [t],
  )

  const confirmRemove = useCallback(
    (member: MemberOut) => {
      const name = member.nickname || member.email

      Alert.alert(t('settings.removeFromHousehold'), t('settings.removeMemberConfirm', { name }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: () => void runExclusive(member.user_id, () => remove.mutateAsync(member.user_id)),
        },
      ])
    },
    [t, runExclusive, remove],
  )

  const openMemberMenu = useCallback(
    (member: MemberOut) => {
      const canPromote = member.role !== 'admin'
      const promoteOption = {
        label: t('settings.makeAdmin'),
        onPress: () => void runExclusive(member.user_id, () => promote.mutateAsync(member.user_id)),
      }
      const removeOption = {
        label: t('settings.removeFromHousehold'),
        destructive: true,
        onPress: () => confirmRemove(member),
      }

      showActionMenu({ options: canPromote ? [promoteOption, removeOption] : [removeOption] })
    },
    [t, showActionMenu, confirmRemove, runExclusive, promote],
  )

  return { members, isLoading, busyUserId, openMemberMenu }
}
