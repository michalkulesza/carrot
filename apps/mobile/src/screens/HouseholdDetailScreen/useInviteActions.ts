import { useCallback, useRef, useState } from 'react'
import { Alert, Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useTranslation } from 'react-i18next'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import type { HouseholdOut } from '@carrot/shared/types'
import { useActionMenu } from '../../context/DialogContext'
import { successHaptic } from '../../components/ui/haptics'
import { isValidEmail } from './helpers'

export const useInviteActions = (household: HouseholdOut, isAdmin: boolean) => {
  const { t } = useTranslation()
  const { invite, rotateCode } = useHouseholds()
  const showActionMenu = useActionMenu()
  const [inviting, setInviting] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [emailMessage, setEmailMessage] = useState<{ text: string; success: boolean } | null>(null)
  const sharingRef = useRef(false)
  const invitingRef = useRef(false)
  const rotatingRef = useRef(false)

  const shareCode = useCallback(async () => {
    if (sharingRef.current) return
    sharingRef.current = true

    try {
      await Share.share({ message: t('settings.shareCodeMessage', { code: household.invite_code }) })
    } finally {
      sharingRef.current = false
    }
  }, [household.invite_code, t])

  const copyCode = useCallback(async () => {
    await Clipboard.setStringAsync(household.invite_code)
    successHaptic()
  }, [household.invite_code])

  const regenerateCode = useCallback(async () => {
    if (rotatingRef.current) return
    rotatingRef.current = true
    setRotating(true)

    try {
      await rotateCode.mutateAsync(household.id)
      successHaptic()
    } catch (e) {
      Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.failedToSave'))
    } finally {
      rotatingRef.current = false
      setRotating(false)
    }
  }, [household.id, rotateCode, t])

  const openCodeMenu = useCallback(() => {
    const copyOption = { label: t('common.copy'), onPress: () => void copyCode() }
    const regenerateOption = { label: t('settings.regenerate'), onPress: () => void regenerateCode() }

    showActionMenu({ options: isAdmin ? [copyOption, regenerateOption] : [copyOption] })
  }, [t, isAdmin, showActionMenu, copyCode, regenerateCode])

  const sendInvite = useCallback(
    async (rawEmail: string): Promise<boolean> => {
      const email = rawEmail.trim()
      if (invitingRef.current) return false

      if (!isValidEmail(email)) {
        setEmailMessage({ text: t('settings.inviteEmailInvalid'), success: false })
        return false
      }
      invitingRef.current = true
      setInviting(true)
      setEmailMessage(null)

      try {
        await invite.mutateAsync({ householdId: household.id, email })
        successHaptic()
        setEmailMessage({ text: t('settings.inviteSentTo', { email }), success: true })
        return true
      } catch (e) {
        setEmailMessage({ text: e instanceof Error ? e.message : t('settings.invitationFailed'), success: false })
        return false
      } finally {
        invitingRef.current = false
        setInviting(false)
      }
    },
    [household.id, invite, t],
  )

  const clearEmailMessage = useCallback(() => setEmailMessage(null), [])

  return { inviting, rotating, emailMessage, shareCode, openCodeMenu, sendInvite, clearEmailMessage }
}
