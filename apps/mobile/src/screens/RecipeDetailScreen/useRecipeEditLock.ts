import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Alert, AppState } from 'react-native'
import * as Sentry from '@sentry/react-native'
import type { TFunction } from 'i18next'
import type { ApiClient } from '@carrot/shared/api/client'
import { ApiError, getConflictInfo } from '@carrot/shared/api/errors'
import { acquireRecipeEditLock, MIN_EDIT_PENDING_MS } from '@carrot/shared/utils/recipeEditLock'
import { withMinimumDuration } from '@carrot/shared/utils/withMinimumDuration'

const KEEPALIVE_INTERVAL_MS = 5000
const EXPECTED_ERROR_STATUSES = new Set([404, 409])

const reportUnexpectedError = (error: unknown, context: string) => {
  const isExpected = !(error instanceof ApiError) || EXPECTED_ERROR_STATUSES.has(error.status)
  if (isExpected) return
  Sentry.captureException(error, { tags: { apiContext: context } })
}

export const useRecipeEditLock = ({
  api,
  recipeId,
  editing,
  t,
}: {
  api: ApiClient
  recipeId: string
  editing: boolean
  t: TFunction
}) => {
  const expectedVersionRef = useRef<number | null>(null)
  const lockAlertShownRef = useRef(false)
  const editingRef = useRef(editing)
  editingRef.current = editing

  const showLockedAlert = useCallback(({ editor, sameUser }: { editor: string; sameUser: boolean }) => {
    if (sameUser) {
      Alert.alert(t('recipes.editLockedOwnDeviceTitle'), t('recipes.editLockedOwnDeviceMessage'))
      return
    }
    Alert.alert(t('recipes.editLockedTitle', { name: editor }), t('recipes.editLockedMessage'))
  }, [t])

  const sendLockAction = useCallback(async (action: 'start' | 'keepalive'): Promise<boolean> => {
    try {
      await api.setRecipeEditLock(recipeId, action)

      // Edit was cancelled while the request was in flight; don't hold the lock until its TTL.
      if (!editingRef.current) void api.setRecipeEditLock(recipeId, 'stop').catch(() => undefined)

      return true
    } catch (error) {
      const conflict = getConflictInfo(error)
      if (conflict?.code === 'recipe_locked') {
        if (!lockAlertShownRef.current) {
          lockAlertShownRef.current = true
          showLockedAlert(conflict)
        }
        return false
      }
      reportUnexpectedError(error, 'recipeEditLock')
      return true
    }
  }, [api, recipeId, showLockedAlert])

  const acquire = useCallback(async (editVersion: number): Promise<boolean> => {
    expectedVersionRef.current = editVersion
    lockAlertShownRef.current = false

    const result = await withMinimumDuration(acquireRecipeEditLock(api, recipeId), MIN_EDIT_PENDING_MS)

    if (result.status === 'acquired') return true
    if (result.status === 'locked') {
      lockAlertShownRef.current = true
      showLockedAlert(result.conflict)
      return false
    }
    reportUnexpectedError(result.error, 'recipeEditLock')
    Alert.alert(t('recipes.editLockCheckFailedTitle'), t('recipes.editLockCheckFailedMessage'))
    return false
  }, [api, recipeId, showLockedAlert, t])

  const release = useCallback(() => {
    void api.setRecipeEditLock(recipeId, 'stop').catch(() => undefined)
  }, [api, recipeId])

  useEffect(() => {
    if (!editing) return

    const interval = setInterval(() => void sendLockAction('keepalive'), KEEPALIVE_INTERVAL_MS)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sendLockAction('start')
    })

    return () => {
      clearInterval(interval)
      subscription.remove()
    }
  }, [editing, sendLockAction])

  useEffect(() => () => {
    if (editingRef.current) release()
  }, [release])

  return useMemo(
    () => ({ expectedVersionRef, acquire, release, showLockedAlert, reportUnexpectedError }),
    [acquire, release, showLockedAlert],
  )
}
