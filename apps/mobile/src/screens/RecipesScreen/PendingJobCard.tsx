import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Linking, PlatformColor, Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import type { ImportJob } from '@carrot/shared/types'
import { colors } from '../../theme/colors'
import Avatar from '../../components/Avatar'
import MarqueeRow from '../../components/MarqueeRow'
import { MarqueeSyncSlots } from '../../components/MarqueeSync'
import { PLACEHOLDER_URL } from '../../api/thumbnailUrl'
import { clearImportImagePreview, getImportImagePreview } from '../../utils/importImagePreviews'
import { styles } from './styles'

const PendingJobCard = ({
  job,
  onRetry,
  onCancel,
  onDismiss,
  onContinueManually,
}: {
  job: ImportJob
  onRetry: () => Promise<unknown>
  onCancel: () => Promise<unknown>
  onDismiss: () => Promise<unknown>
  onContinueManually: () => void
}) => {
  const { t } = useTranslation()
  const [actionPending, setActionPending] = useState(false)
  const actionInProgress = useRef(false)
  const sourceUrlOpening = useRef(false)
  const retryScheduled = job.status === 'pending' && job.retry_count > 0
  const importingMemberName = job.created_by_name ?? t('importJobs.someone')
  const imagePreview = getImportImagePreview(job.id)
  const imageUri = imagePreview ?? (job.kind === 'text' ? PLACEHOLDER_URL : null)
  const title = job.status === 'failed'
    ? t(`importJobs.failure.${job.failure_code ?? 'unexpected'}`)
    : job.status === 'running'
      ? t('importJobs.running')
      : retryScheduled
        ? t('importJobs.takingLonger')
        : t('importJobs.pending')
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
  const handleRetry = () => void handleAction(onRetry)
  const handleCancel = () => void handleAction(onCancel)
  const handleDismiss = () => void handleAction(onDismiss)
  const requiresUserAction = job.status === 'failed' && job.failure_code === 'user_action_required'
  const canOpenSourceUrl = Boolean(job.source_url)
  const handleUserAction = () => {
    Alert.alert(t('importJobs.userActionRequired.title'), t('importJobs.userActionRequired.body'), [
      { text: t('importJobs.dismiss'), style: 'destructive', onPress: handleDismiss },
      {
        text: t('importJobs.userActionRequired.continue'),
        onPress: () => {
          onContinueManually()
          handleDismiss()
        },
      },
    ])
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

  const cardContent = (
    <>
      <View style={styles.pendingImageWrap}>
        {imageUri && <Image source={{ uri: imageUri }} style={styles.pendingImage} />}
        {job.status === 'failed' ? (
          <View style={styles.pendingFailureOverlay}>
            <Feather name="alert-circle" size={28} color={PlatformColor('secondaryLabel') as unknown as string} />
          </View>
        ) : (
          <View style={styles.pendingSpinnerOverlay}>
            <ActivityIndicator size="small" color={colors.tertiaryLabel} />
          </View>
        )}
      </View>
      <View style={styles.pendingBody}>
        <Text style={styles.pendingTitle}>{title}</Text>
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
                <View style={styles.cardTagPill}>
                  <Text style={styles.cardTagPillText} numberOfLines={1}>{job.source_url}</Text>
                </View>
              </MarqueeRow>
            )}
          </MarqueeSyncSlots>
        )}
        <View style={styles.pendingMetaRow}>
          <Avatar name={importingMemberName} size={18} />
        </View>
      </View>
    </>
  )

  useEffect(() => () => clearImportImagePreview(job.id), [job.id])

  return (
    <View style={[styles.pendingCard, requiresUserAction && styles.pendingCardActionRequired]}>
      {canOpenSourceUrl ? (
        <Pressable
          style={styles.pendingContent}
          onLongPress={handleSourceUrlMenu}
          delayLongPress={500}
          accessibilityRole="button"
          accessibilityLabel={job.source_url ?? ''}
        >
          {cardContent}
        </Pressable>
      ) : (
        <View style={styles.pendingContent}>{cardContent}</View>
      )}
      {requiresUserAction ? (
        <View style={styles.pendingCancelWrap}>
          <Pressable style={styles.pendingIconAction} onPress={handleUserAction} accessibilityLabel={t('importJobs.userActionRequired.continue')}>
            <Feather name="chevron-right" size={22} color={colors.brand} />
          </Pressable>
        </View>
      ) : job.status === 'failed' ? (
        <View style={styles.pendingActionRow}>
          <Pressable style={styles.pendingIconAction} disabled={actionPending} onPress={handleRetry} accessibilityLabel={t('importJobs.retry')}>
            <Feather name="refresh-cw" size={16} color={colors.blue} />
          </Pressable>
          <Pressable style={styles.pendingIconAction} disabled={actionPending} onPress={handleDismiss} accessibilityLabel={t('importJobs.dismiss')}>
            <Feather name="x" size={18} color={PlatformColor('secondaryLabel') as unknown as string} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.pendingCancelWrap}>
          <Pressable style={styles.pendingIconAction} disabled={actionPending} onPress={handleCancel} accessibilityLabel={t('importJobs.cancel')}>
            <Feather name="x" size={18} color={PlatformColor('secondaryLabel') as unknown as string} />
          </Pressable>
        </View>
      )}
    </View>
  )
}

export default PendingJobCard
