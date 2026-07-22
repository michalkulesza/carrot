import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, PlatformColor, Pressable, Text, View } from 'react-native'
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
  const handleUserAction = () => {
    Alert.alert(t('importJobs.userActionRequired.title'), t('importJobs.userActionRequired.body'), [
      { text: t('common.remove'), style: 'destructive', onPress: handleDismiss },
      { text: t('importJobs.userActionRequired.continue'), onPress: onContinueManually },
    ])
  }

  useEffect(() => () => clearImportImagePreview(job.id), [job.id])

  return (
    <View style={[styles.pendingCard, requiresUserAction && styles.pendingCardActionRequired]}>
      <View style={styles.pendingImageWrap}>
        {imageUri && <Image source={{ uri: imageUri }} style={styles.pendingImage} />}
        {job.status === 'failed' ? (
          <Feather name="alert-circle" size={28} color={PlatformColor('secondaryLabel') as unknown as string} />
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
