import { memo } from 'react'
import { ActivityIndicator, View } from 'react-native'
import Animated, { ZoomIn } from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import type { AllergenRecheckStatus } from '@carrot/shared/types'
import { AppText, ProgressBar } from '../../components/ui'
import { useAnnounce } from '../../hooks/useAnnounce'
import { palette, settleSpring, useMotion } from '../../theme'
import { styles } from './styles'

interface AllergenCheckStatusProps {
  status: AllergenRecheckStatus | null
}

const CHECK_ICON_SIZE = 11
const runningCardStyle = [styles.checkCard, styles.checkRunning]
const doneCardStyle = [styles.checkCard, styles.checkRow, styles.checkDone]
const failedCardStyle = [styles.checkCard, styles.checkRow, styles.checkFailed]
const doneBadgeStyle = [styles.checkBadge, styles.checkBadgeDone]
const failedBadgeStyle = [styles.checkBadge, styles.checkBadgeFailed]
const checkPop = ZoomIn.springify().damping(settleSpring.damping).stiffness(settleSpring.stiffness)

const RunningCard = ({ status }: { status: AllergenRecheckStatus }) => {
  const { t } = useTranslation()
  const progress = status.total > 0 ? status.completed / status.total : undefined

  return (
    <View style={runningCardStyle}>
      <View style={styles.checkRow}>
        <ActivityIndicator size="small" color={palette.actionText} />
        <AppText variant="chip" tone="tintText" style={styles.flex}>
          {t('settings.allergenRecheckRunning')}
        </AppText>
        <AppText variant="pillSmall" tone="actionText" tabular>
          {t('settings.allergenRecheckCount', { completed: status.completed, total: status.total })}
        </AppText>
      </View>
      <ProgressBar value={progress} trackTone="actionTrack" />
    </View>
  )
}

const DoneCard = ({ status }: { status: AllergenRecheckStatus }) => {
  const { t } = useTranslation()
  const { rowEntering } = useMotion()
  const failed = status.failed > 0
  const title = failed
    ? t('settings.allergenRecheckFailed', { failed: status.failed })
    : t('settings.allergenRecheckComplete')
  const badgeEntering = rowEntering ? checkPop : undefined
  const icon = failed ? 'exclamationmark' : 'checkmark'

  return (
    <View style={failed ? failedCardStyle : doneCardStyle}>
      <Animated.View entering={badgeEntering} style={failed ? failedBadgeStyle : doneBadgeStyle}>
        <SymbolView name={icon} size={CHECK_ICON_SIZE} weight="heavy" tintColor={palette.onAction} />
      </Animated.View>
      <View style={styles.flex}>
        <AppText variant="chip" tone={failed ? 'error' : 'success'}>
          {title}
        </AppText>
        {failed ? null : (
          <AppText variant="tileMeta" tone="textSecondary">
            {t('settings.allergenRecheckChecked', { count: status.total })}
          </AppText>
        )}
      </View>
    </View>
  )
}

const AllergenCheckStatus = ({ status }: AllergenCheckStatusProps) => {
  const { t } = useTranslation()
  const { entering, exiting, layout } = useMotion()
  const announcement = status?.done
    ? status.failed > 0
      ? t('settings.allergenRecheckFailed', { failed: status.failed })
      : t('settings.allergenRecheckComplete')
    : status && status.total > 0
      ? t('settings.allergenRecheckRunning')
      : null

  useAnnounce(announcement)

  if (!status || status.total === 0) return null

  const phase = status.done ? 'done' : 'running'

  return (
    <Animated.View style={styles.checkSlot} layout={layout} accessibilityLiveRegion="polite">
      <Animated.View key={phase} entering={entering} exiting={exiting}>
        {status.done ? <DoneCard status={status} /> : <RunningCard status={status} />}
      </Animated.View>
    </Animated.View>
  )
}

export default memo(AllergenCheckStatus)
