import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, PlatformColor, Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import type { ImportJob } from '@carrot/shared/types'
import { colors } from '../../theme/colors'
import Avatar from '../../components/Avatar'
import { PLACEHOLDER_URL } from '../../api/thumbnailUrl'
import { clearImportImagePreview, getImportImagePreview } from '../../utils/importImagePreviews'
import { styles } from './styles'

const PendingJobCard = ({
  job,
  onRetry,
  onCancel,
  onDismiss,
}: {
  job: ImportJob
  onRetry: () => Promise<unknown>
  onCancel: () => Promise<unknown>
  onDismiss: () => Promise<unknown>
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

  useEffect(() => () => clearImportImagePreview(job.id), [job.id])

  return (
    <View style={styles.pendingCard}>
      <View style={styles.pendingImageWrap}>
        {imageUri && <Image source={{ uri: imageUri }} style={styles.pendingImage} />}
        {job.status === 'failed' ? (
          <Feather name="alert-circle" size={28} color={PlatformColor('secondaryLabel') as unknown as string} />
        ) : (
          <View style={styles.pendingSpinnerOverlay}>
            <ActivityIndicator size="small" color={PlatformColor('systemBackground')} />
          </View>
        )}
      </View>
      <View style={styles.pendingBody}>
        <Text style={styles.pendingTitle}>{title}</Text>
        <View style={styles.pendingMetaRow}>
          <Avatar name={importingMemberName} size={18} />
          {job.status === 'failed' ? (
            <View style={styles.pendingActions}>
              <Pressable disabled={actionPending} onPress={handleRetry} accessibilityLabel={t('importJobs.retry')}><Text style={styles.pendingActionPrimary}>{t('importJobs.retry')}</Text></Pressable>
              <Pressable disabled={actionPending} onPress={handleDismiss} accessibilityLabel={t('importJobs.dismiss')}><Text style={styles.pendingActionSecondary}>{t('importJobs.dismiss')}</Text></Pressable>
            </View>
          ) : null}
        </View>
      </View>
      {job.status !== 'failed' && (
        <View style={styles.pendingCancelWrap}>
          <Pressable disabled={actionPending} onPress={handleCancel} accessibilityLabel={t('importJobs.cancel')}><Feather name="x" size={18} color={PlatformColor('secondaryLabel') as unknown as string} /></Pressable>
        </View>
      )}
    </View>
  )
}

export default PendingJobCard
