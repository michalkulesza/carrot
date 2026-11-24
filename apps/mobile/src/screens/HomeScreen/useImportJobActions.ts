import { useCallback, useRef } from 'react'
import { ActionSheetIOS, Alert, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import * as Haptics from 'expo-haptics'
import type { ImportJob } from '@carrot/shared/types'
import { isOptimisticJobId } from '@carrot/shared/utils/optimisticImportJob'
import { deviceCaptureStore, useDeviceCaptureState } from '../../components/DeviceHtmlCapture/store'
import { dismissPresentedByCollapseId } from '../../lib/presentedNotifications'
import { isDuplicateJob } from './helpers'

export interface ImportJobActions {
  retry: (jobId: string) => Promise<unknown>
  importAnyway: (jobId: string) => Promise<unknown>
  cancel: (jobId: string) => Promise<unknown>
  dismiss: (jobId: string) => Promise<unknown>
  onGoToRecipe: (recipeId: string) => void
  onContinueManually: (sourceUrl: string | null) => void
}

const getCardTitle = (job: ImportJob, capturingOnDevice: boolean, retryScheduled: boolean, t: TFunction) => {
  if (capturingOnDevice) return t('importJobs.capturingOnDevice')
  if (isDuplicateJob(job)) return t('importJobs.failure.duplicate_recipe')
  if (job.status === 'failed') return t(`importJobs.failure.${job.failure_code ?? 'unexpected'}`)
  if (job.status === 'running') return t('home.imports.importing')
  if (retryScheduled) return t('importJobs.takingLonger')
  return t('importJobs.pending')
}

const clearAfter = async (action: Promise<unknown>, jobId: string) => {
  await action
  void dismissPresentedByCollapseId(`import:${jobId}`)
}

export const useImportJobActions = (job: ImportJob, actions: ImportJobActions) => {
  const { t } = useTranslation()
  const { capturingJobId } = useDeviceCaptureState()
  const actionInProgress = useRef(false)
  const sourceUrlOpening = useRef(false)
  const { retry, importAnyway, cancel, dismiss, onGoToRecipe, onContinueManually } = actions

  const retryScheduled = job.status === 'pending' && job.retry_count > 0
  const capturingOnDevice = job.status === 'failed' && capturingJobId === job.id
  const title = getCardTitle(job, capturingOnDevice, retryScheduled, t)
  const canOpenSourceUrl = Boolean(job.source_url)
  const isFailedCard = job.status === 'failed' && !capturingOnDevice
  const isDuplicate = isFailedCard && isDuplicateJob(job)
  const isOptimistic = isOptimisticJobId(job.id)

  const handleAction = useCallback(async (action: () => Promise<unknown>) => {
    if (actionInProgress.current) return
    actionInProgress.current = true
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      await action()
    } catch {
      // The existing import-job stream keeps the card available for a retry.
    } finally {
      actionInProgress.current = false
    }
  }, [])

  const handleRetry = useCallback(() => {
    deviceCaptureStore.reset(job.id)
    return handleAction(() => clearAfter(retry(job.id), job.id))
  }, [handleAction, job.id, retry])

  const handleCancel = useCallback(
    () => handleAction(() => clearAfter(cancel(job.id), job.id)),
    [cancel, handleAction, job.id],
  )

  const handleDismiss = useCallback(
    () => handleAction(() => clearAfter(dismiss(job.id), job.id)),
    [dismiss, handleAction, job.id],
  )

  const handleImportAnyway = useCallback(
    () => handleAction(() => clearAfter(importAnyway(job.id), job.id)),
    [handleAction, importAnyway, job.id],
  )

  const handleGoToRecipe = useCallback(() => {
    if (job.duplicate_recipe_id) onGoToRecipe(job.duplicate_recipe_id)
  }, [job.duplicate_recipe_id, onGoToRecipe])

  const handleContinueManually = useCallback(
    () => onContinueManually(job.source_url),
    [job.source_url, onContinueManually],
  )

  const handleOpenSourceUrl = useCallback(async () => {
    if (!job.source_url || sourceUrlOpening.current) return

    sourceUrlOpening.current = true
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      await Linking.openURL(job.source_url)
    } catch {
      Alert.alert(t('common.whoops'), t('common.somethingWentWrong'))
    } finally {
      sourceUrlOpening.current = false
    }
  }, [job.source_url, t])

  const showActionSheet = useCallback(
    (actionList: { label: string; run: () => void }[], message?: string, hasDestructive = true) => {
      const options = [...actionList.map((action) => action.label), t('common.cancel')]
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options,
          destructiveButtonIndex: hasDestructive ? actionList.length - 1 : undefined,
          cancelButtonIndex: actionList.length,
        },
        (index) => actionList[index]?.run(),
      )
    },
    [t, title],
  )

  const handleDuplicateMenu = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    showActionSheet(
      [
        { label: t('importJobs.duplicate.importAnyway'), run: () => void handleImportAnyway() },
        ...(job.duplicate_recipe_id
          ? [{ label: t('importJobs.duplicate.goToRecipe'), run: handleGoToRecipe }]
          : []),
        { label: t('importJobs.duplicate.dontImport'), run: () => void handleDismiss() },
      ],
      t('importJobs.duplicate.message'),
    )
  }, [handleDismiss, handleGoToRecipe, handleImportAnyway, job.duplicate_recipe_id, showActionSheet, t])

  const handleFailedMenu = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    showActionSheet(
      [
        ...(canOpenSourceUrl ? [{ label: t('importJobs.openAndPaste'), run: handleContinueManually }] : []),
        { label: t('importJobs.retry'), run: () => void handleRetry() },
        { label: t('importJobs.cancelImport'), run: () => void handleDismiss() },
      ],
      canOpenSourceUrl ? t('importJobs.userActionRequired.body') : undefined,
    )
  }, [canOpenSourceUrl, handleContinueManually, handleDismiss, handleRetry, showActionSheet, t])

  const handlePendingMenu = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    showActionSheet(
      [
        ...(canOpenSourceUrl ? [{ label: t('importJobs.openLink'), run: () => void handleOpenSourceUrl() }] : []),
        ...(isOptimistic ? [] : [{ label: t('importJobs.cancelImport'), run: () => void handleCancel() }]),
      ],
      undefined,
      !isOptimistic,
    )
  }, [canOpenSourceUrl, handleCancel, handleOpenSourceUrl, isOptimistic, showActionSheet, t])

  const handleMenu = isFailedCard ? (isDuplicate ? handleDuplicateMenu : handleFailedMenu) : handlePendingMenu
  const hasMenu = isFailedCard || canOpenSourceUrl || !isOptimistic

  return {
    title,
    isFailedCard,
    isDuplicate,
    handleMenu: hasMenu ? handleMenu : undefined,
  }
}
