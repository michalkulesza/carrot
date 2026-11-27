import { memo, useCallback } from 'react'
import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { AppText, IconButton, Pill, ProgressBar } from '../../components/ui'
import { lightHaptic } from '../../components/ui/haptics'
import { formatCountdown, getTimerDestination, withNavigationNonce, type TimerEntry } from '../../context/TimerContext'
import { useTapGuard } from '../../hooks/useTapGuard'
import { getTimerLabel, getTimerProgress, getTimerState, getTimerTone } from './timerHelpers'
import { styles } from './styles'

interface TimerRowProps {
  timer: TimerEntry
  remaining: number
  done: boolean
  onPause: (id: string) => void
  onResume: (id: string) => void
  onDismiss: (id: string) => void
}

const TimerRow = ({ timer, remaining, done, onPause, onResume, onDismiss }: TimerRowProps) => {
  const { t } = useTranslation()
  const router = useRouter()
  const guardTap = useTapGuard()
  const state = getTimerState(timer, done)
  const paused = state === 'paused'
  const label = getTimerLabel(timer)
  const countdown = done ? t('home.timers.done') : formatCountdown(remaining)
  const tone = getTimerTone(state)

  const handleOpen = useCallback(() => {
    if (!guardTap()) return

    lightHaptic()
    router.push(withNavigationNonce(getTimerDestination(timer)))
  }, [guardTap, router, timer])

  const handleToggle = useCallback(() => {
    if (!guardTap()) return

    if (paused) onResume(timer.id)
    else onPause(timer.id)
  }, [guardTap, onPause, onResume, paused, timer.id])

  const handleDismiss = useCallback(() => {
    if (!guardTap()) return

    onDismiss(timer.id)
  }, [guardTap, onDismiss, timer.id])

  const toggleLabel = t(paused ? 'home.timers.resume' : 'home.timers.pause', { label })
  const dismissLabel = t('home.timers.dismiss')

  return (
    <View style={styles.timerRow}>
      <Pressable
        style={styles.timerRowMain}
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${countdown}. ${timer.recipeTitle}`}
      >
        <View style={styles.timerRowHeader}>
          <AppText variant="rowTitle" numberOfLines={1} style={styles.flexFill}>
            {label}
          </AppText>
          <AppText variant="rowTitle" tone={tone} tabular>
            {countdown}
          </AppText>
        </View>
        <ProgressBar value={done ? 1 : getTimerProgress(timer, remaining)} tone={tone} />
        <AppText variant="tileMeta" tone="textTertiary" numberOfLines={1}>
          {timer.recipeTitle}
        </AppText>
      </Pressable>
      {done ? (
        <Pill label={dismissLabel} size="md" onPress={handleDismiss} accessibilityLabel={`${dismissLabel}, ${label}`} />
      ) : (
        <IconButton
          icon={paused ? 'play.fill' : 'pause.fill'}
          accessibilityLabel={toggleLabel}
          onPress={handleToggle}
        />
      )}
    </View>
  )
}

export default memo(TimerRow)
