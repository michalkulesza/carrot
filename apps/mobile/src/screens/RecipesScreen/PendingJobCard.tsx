import { ActivityIndicator, PlatformColor, Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import type { ImportJob } from '@carrot/shared/types'
import { colors } from '../../theme/colors'
import Avatar from '../../components/Avatar'
import { styles } from './styles'

const PendingJobCard = ({
  job,
  onRetry,
  onCancel,
  onDismiss,
}: {
  job: ImportJob
  onRetry: () => void
  onCancel: () => void
  onDismiss: () => void
}) => {
  const { t } = useTranslation()
  const retryScheduled = job.status === 'pending' && job.retry_count > 0
  const importingMemberName = job.created_by_name ?? t('importJobs.someone')
  const title = job.status === 'failed'
    ? t(`importJobs.failure.${job.failure_code ?? 'unexpected'}`)
    : job.status === 'running'
      ? t('importJobs.running')
      : retryScheduled
        ? t('importJobs.takingLonger')
        : t('importJobs.pending')
  const handleAction = (action: () => void) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    action()
  }
  const handleRetry = () => handleAction(onRetry)
  const handleCancel = () => handleAction(onCancel)
  const handleDismiss = () => handleAction(onDismiss)

  return (
    <View style={styles.pendingCard}>
      <View style={styles.pendingImageWrap}>
        {job.status === 'failed' ? (
          <Feather name="alert-circle" size={28} color={PlatformColor('secondaryLabel') as unknown as string} />
        ) : (
          <ActivityIndicator size="small" color="#fff" />
        )}
      </View>
      <View style={styles.pendingBody}>
        <Text style={styles.pendingTitle}>{title}</Text>
        <View style={styles.pendingMetaRow}>
          <Avatar name={importingMemberName} size={18} />
          {job.status === 'failed' ? (
            <View style={styles.pendingActions}>
              <Pressable onPress={handleRetry} accessibilityLabel={t('importJobs.retry')}><Text style={styles.pendingActionPrimary}>{t('importJobs.retry')}</Text></Pressable>
              <Pressable onPress={handleDismiss} accessibilityLabel={t('importJobs.dismiss')}><Text style={styles.pendingActionSecondary}>{t('importJobs.dismiss')}</Text></Pressable>
            </View>
          ) : null}
        </View>
      </View>
      {job.status !== 'failed' && (
        <View style={styles.pendingCancelWrap}>
          <Pressable onPress={handleCancel} accessibilityLabel={t('importJobs.cancel')}><Feather name="x" size={18} color={PlatformColor('secondaryLabel') as unknown as string} /></Pressable>
        </View>
      )}
    </View>
  )
}

export default PendingJobCard
