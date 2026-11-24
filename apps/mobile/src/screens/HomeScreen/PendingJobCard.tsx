import { useRef, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Linking, PlatformColor, Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import * as Haptics from 'expo-haptics'
import type { ImportJob } from '@carrot/shared/types'
import { colors } from '../../theme/colors'
import Avatar from '../../components/Avatar'
import MarqueeRow from '../../components/MarqueeRow'
import { MarqueeSyncSlots } from '../../components/MarqueeSync'
import { PLACEHOLDER_URL } from '../../api/thumbnailUrl'
import { getImportImagePreview } from '../../utils/importImagePreviews'
import { useImportPreview } from '../../hooks/useImportPreview'
import NetworkImage from '../../components/NetworkImage'
import { isOptimisticJobId } from '@carrot/shared/utils/optimisticImportJob'
import { PERSONAL_LIBRARY_COLOR } from '@carrot/shared/utils/householdColors'
import { useAuth } from '../../context/AuthContext'
import { deviceCaptureStore, useDeviceCaptureState } from '../../components/DeviceHtmlCapture/store'
import { styles } from './styles'

const getCardTitle = (job: ImportJob, capturingOnDevice: boolean, retryScheduled: boolean, t: TFunction) => {
  if (capturingOnDevice) return t('importJobs.capturingOnDevice')
  if (job.status === 'failed') return t(`importJobs.failure.${job.failure_code ?? 'unexpected'}`)
  if (job.status === 'running') return t('importJobs.running')
  if (retryScheduled) return t('importJobs.takingLonger')
  return t('importJobs.pending')
}

const PendingJobCard = ({
  job,
  onRetry,
  onImportAnyway,
  onGoToRecipe,
  onCancel,
  onDismiss,
  onContinueManually,
}: {
  job: ImportJob
  onRetry: () => Promise<unknown>
  onImportAnyway: () => Promise<unknown>
  onGoToRecipe: (recipeId: string) => void
  onCancel: () => Promise<unknown>
  onDismiss: () => Promise<unknown>
  onContinueManually: () => void
}) => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { capturingJobId } = useDeviceCaptureState()
  const [actionPending, setActionPending] = useState(false)
  const actionInProgress = useRef(false)
  const sourceUrlOpening = useRef(false)
  const retryScheduled = job.status === 'pending' && job.retry_count > 0
  const isCurrentUserImport = job.created_by_user_id === user?.id
  const importingMemberName = job.created_by_name ?? t('importJobs.someone')
  const imagePreview = getImportImagePreview(job.id)
  const resolvedImagePreview = useImportPreview(job.source_url, !imagePreview)
  const imageUri = imagePreview ?? resolvedImagePreview ?? (job.kind === 'text' ? PLACEHOLDER_URL : null)
  const capturingOnDevice = job.status === 'failed' && capturingJobId === job.id
  const title = getCardTitle(job, capturingOnDevice, retryScheduled, t)
  const handleAction = async (action: () => Promise<unknown>) => {
    if (actionInProgress.current) return
    actionInProgress.current = true
    setActionPending(true)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      await action()
    } catch {
      // The existing import-job stream keeps the card available for a retry.
    } finally {
      actionInProgress.current = false
      setActionPending(false)
    }
  }
  const handleRetry = () => {
    deviceCaptureStore.reset(job.id)
    void handleAction(onRetry)
  }
  const handleCancel = () => void handleAction(onCancel)
  const handleDismiss = () => void handleAction(onDismiss)
  const canOpenSourceUrl = Boolean(job.source_url)
  const isFailedCard = job.status === 'failed' && !capturingOnDevice
  const isDuplicate = job.failure_code === 'duplicate_recipe'
  const handleImportAnyway = () => void handleAction(onImportAnyway)
  const handleGoToRecipe = () => {
    if (job.duplicate_recipe_id) onGoToRecipe(job.duplicate_recipe_id)
  }
  const handleDuplicateMenu = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const actions = [
      { label: t('importJobs.duplicate.importAnyway'), run: handleImportAnyway },
      ...(job.duplicate_recipe_id ? [{ label: t('importJobs.duplicate.goToRecipe'), run: handleGoToRecipe }] : []),
      { label: t('importJobs.duplicate.dontImport'), run: handleDismiss },
    ]
    const options = [...actions.map((action) => action.label), t('common.cancel')]
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message: t('importJobs.duplicate.message'),
        options,
        destructiveButtonIndex: actions.length - 1,
        cancelButtonIndex: actions.length,
      },
      (index) => actions[index]?.run(),
    )
  }
  const handleFailedMenu = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const actions = [
      ...(canOpenSourceUrl ? [{ label: t('importJobs.openAndPaste'), run: onContinueManually }] : []),
      { label: t('importJobs.retry'), run: handleRetry },
      { label: t('importJobs.cancelImport'), run: handleDismiss },
    ]
    const options = [...actions.map((action) => action.label), t('common.cancel')]
    const message = canOpenSourceUrl ? t('importJobs.userActionRequired.body') : undefined
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options,
        destructiveButtonIndex: actions.length - 1,
        cancelButtonIndex: actions.length,
      },
      (index) => actions[index]?.run(),
    )
  }
  const handleOpenSourceUrl = async () => {
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
  }
  const handleSourceUrlMenu = () => {
    if (!job.source_url) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.alert(job.source_url, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('importJobs.openLink'), onPress: () => void handleOpenSourceUrl() },
    ])
  }

  const handleCardPress = isFailedCard ? (isDuplicate ? handleDuplicateMenu : handleFailedMenu) : undefined
  const handleCardLongPress = canOpenSourceUrl ? handleSourceUrlMenu : undefined
  const isCardInteractive = Boolean(handleCardPress || handleCardLongPress)
  const isOptimistic = isOptimisticJobId(job.id)

  const cardStyle = [styles.pendingCard, isFailedCard && styles.pendingCardAttention]
  const titleStyle = [styles.pendingTitle, isFailedCard && styles.pendingTitleAttention]
  const urlPillStyle = [styles.cardTagPill, isFailedCard && styles.pendingUrlPillAttention]
  const urlPillTextStyle = [styles.cardTagPillText, isFailedCard && styles.pendingUrlPillTextAttention]

  const cardContent = (
    <>
      <View style={styles.pendingImageWrap}>
        {imageUri && <NetworkImage uri={imageUri} recyclingKey={imageUri} style={styles.pendingImage} />}
        {!isFailedCard && (
          <View style={styles.pendingSpinnerOverlay}>
            <ActivityIndicator size="small" color={colors.tertiaryLabel} />
          </View>
        )}
      </View>
      <View style={styles.pendingBody}>
        <Text style={titleStyle}>{title}</Text>
        {job.source_url && (
          <MarqueeSyncSlots>
            {({ tags: tagsTurn }) => (
              <MarqueeRow
                containerStyle={styles.pendingUrlRow}
                gap={4}
                turn={tagsTurn.turn}
                onOverflowChange={tagsTurn.onOverflowChange}
                onDone={tagsTurn.onDone}
              >
                <View style={urlPillStyle}>
                  <Text style={urlPillTextStyle} numberOfLines={1}>{job.source_url}</Text>
                </View>
              </MarqueeRow>
            )}
          </MarqueeSyncSlots>
        )}
        <View style={styles.pendingMetaRow}>
          <Avatar
            name={isCurrentUserImport ? t('households.personal') : importingMemberName}
            label={isCurrentUserImport ? t('households.you').charAt(0) : undefined}
            color={isCurrentUserImport ? PERSONAL_LIBRARY_COLOR : undefined}
            size={18}
          />
        </View>
      </View>
    </>
  )

  return (
    <View style={cardStyle}>
      {isCardInteractive ? (
        <Pressable
          style={styles.pendingContent}
          onPress={handleCardPress}
          onLongPress={handleCardLongPress}
          delayLongPress={500}
          accessibilityRole="button"
          accessibilityLabel={job.source_url ?? title}
        >
          {cardContent}
        </Pressable>
      ) : (
        <View style={styles.pendingContent}>{cardContent}</View>
      )}
      {capturingOnDevice ? null : job.status === 'failed' ? (
        <View style={styles.pendingCancelWrap}>
          <Pressable
            style={styles.pendingIconAction}
            disabled={actionPending}
            onPress={handleCardPress}
            hitSlop={6}
            accessibilityLabel={title}
          >
            <Feather name="alert-circle" size={20} color="#ffffff" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.pendingCancelWrap}>
          <Pressable
            style={styles.pendingIconAction}
            disabled={actionPending || isOptimistic}
            onPress={handleCancel}
            accessibilityLabel={t('importJobs.cancel')}
          >
            <Feather name="x" size={18} color={PlatformColor('secondaryLabel') as unknown as string} />
          </Pressable>
        </View>
      )}
    </View>
  )
}

export default PendingJobCard
