import { useCallback, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { successHaptic } from '../../components/ui/haptics'
import { useAuth } from '../../context/AuthContext'

export const useLeaveHousehold = (householdId: string) => {
  const { t } = useTranslation()
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  const { leave } = useHouseholds()
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)

  const handleConfirm = useCallback(async () => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaving(true)

    try {
      await leave.mutateAsync(householdId)
      successHaptic()
      if (user?.active_household_id === householdId) await refreshUser()
      router.back()
    } catch (e) {
      leavingRef.current = false
      setLeaving(false)
      Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.leaveFailed'))
    }
  }, [householdId, leave, user, refreshUser, router, t])

  const handleLeave = useCallback(() => {
    Alert.alert(t('settings.leaveHousehold'), t('settings.areYouSure'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.leaveHousehold'), style: 'destructive', onPress: handleConfirm },
    ])
  }, [t, handleConfirm])

  return { leaving, handleLeave }
}
