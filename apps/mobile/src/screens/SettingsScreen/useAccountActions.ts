import { useCallback, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { usePrompt } from '../../context/DialogContext'

export const useAccountActions = () => {
  const { t } = useTranslation()
  const { user, logout, deleteAccount } = useAuth()
  const prompt = usePrompt()
  const [isDeleting, setIsDeleting] = useState(false)
  const busyRef = useRef(false)

  const handleLogoutConfirm = useCallback(() => {
    if (busyRef.current) return
    busyRef.current = true

    void logout().finally(() => {
      busyRef.current = false
    })
  }, [logout])

  const handleLogout = useCallback(() => {
    Alert.alert(t('settings.logOutConfirmTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.logOut'), style: 'destructive', onPress: handleLogoutConfirm },
    ])
  }, [t, handleLogoutConfirm])

  const handleDeleteEmailSubmit = useCallback(
    (input: string) => {
      if (!input || input.trim().toLowerCase() !== user?.email?.toLowerCase()) {
        Alert.alert(t('common.somethingWentWrong'), t('settings.deleteAccountEmailMismatch'))
        return
      }
      if (busyRef.current) return
      busyRef.current = true
      setIsDeleting(true)

      deleteAccount()
        .catch((e) => {
          Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : 'Error')
        })
        .finally(() => {
          busyRef.current = false
          setIsDeleting(false)
        })
    },
    [t, deleteAccount, user],
  )

  const handleDeletePromptEmail = useCallback(async () => {
    const input = await prompt({
      title: t('settings.deleteAccountTypeEmailTitle'),
      message: t('settings.deleteAccountTypeEmailMessage', { email: user?.email ?? '' }),
      confirmLabel: t('settings.deleteAccount'),
      destructive: true,
      keyboardType: 'email-address',
      autoCapitalize: 'none',
      textContentType: 'emailAddress',
    })
    if (input !== null) handleDeleteEmailSubmit(input)
  }, [prompt, t, user, handleDeleteEmailSubmit])

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(t('settings.deleteAccountConfirmTitle'), t('settings.deleteAccountConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.deleteAccount'), style: 'destructive', onPress: () => void handleDeletePromptEmail() },
    ])
  }, [t, handleDeletePromptEmail])

  return { isDeleting, handleLogout, handleDeleteAccount }
}
