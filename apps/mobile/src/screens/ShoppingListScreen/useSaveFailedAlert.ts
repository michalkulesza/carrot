import { useCallback, useRef } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'

export const useSaveFailedAlert = () => {
  const { t } = useTranslation()
  const visibleRef = useRef(false)

  const handleDismiss = useCallback(() => {
    visibleRef.current = false
  }, [])

  return useCallback(() => {
    if (visibleRef.current) return

    visibleRef.current = true
    Alert.alert(
      t('common.somethingWentWrong'),
      t('shoppingList.changeNotSaved'),
      [{ text: t('common.ok'), onPress: handleDismiss }],
      { onDismiss: handleDismiss },
    )
  }, [t, handleDismiss])
}
