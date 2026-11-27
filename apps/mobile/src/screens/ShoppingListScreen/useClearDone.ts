import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { AccessibilityInfo, ActionSheetIOS, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { mediumHaptic, successHaptic } from '../../components/ui/haptics'
import { CLEAR_MUTATION_DELAY_MS } from './motion'

interface UseClearDoneParams {
  completedCount: number
  hasVisibleCompleted: boolean
  instant: boolean
  dragActiveRef: MutableRefObject<boolean>
  clearCompleted: (variables: undefined, options: { onSuccess: () => void; onError: () => void; onSettled: () => void }) => void
}

export const useClearDone = ({
  completedCount,
  hasVisibleCompleted,
  instant,
  dragActiveRef,
  clearCompleted,
}: UseClearDoneParams) => {
  const { t } = useTranslation()
  const [clearing, setClearing] = useState(false)
  const clearPendingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const runClear = useCallback((count: number) => {
    const handleSuccess = () => {
      successHaptic()
      AccessibilityInfo.announceForAccessibility(t('shoppingList.clearedAnnouncement', { count }))
    }
    const handleError = () => Alert.alert(t('common.somethingWentWrong'))
    const handleSettled = () => {
      clearPendingRef.current = false
      setClearing(false)
    }

    clearCompleted(undefined, { onSuccess: handleSuccess, onError: handleError, onSettled: handleSettled })
  }, [clearCompleted, t])

  const handleConfirm = useCallback((index: number) => {
    if (index !== 0 || clearPendingRef.current) return

    clearPendingRef.current = true
    mediumHaptic()

    if (instant || !hasVisibleCompleted) {
      runClear(completedCount)
      return
    }

    setClearing(true)
    timerRef.current = setTimeout(() => runClear(completedCount), CLEAR_MUTATION_DELAY_MS)
  }, [completedCount, hasVisibleCompleted, instant, runClear])

  const handleClear = useCallback(() => {
    if (dragActiveRef.current || clearPendingRef.current) return

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t('shoppingList.clearDoneConfirm', { count: completedCount }),
        options: [t('shoppingList.clearCompleted'), t('common.cancel')],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      handleConfirm,
    )
  }, [completedCount, dragActiveRef, handleConfirm, t])

  return { clearing, handleClear }
}
