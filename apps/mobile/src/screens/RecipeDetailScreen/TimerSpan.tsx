import { useEffect, useState } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import {
  formatDurationLabel,
  formatCountdown,
  getRemainingSeconds,
  useTimers,
} from '../../context/TimerContext'
import { colors } from '../../theme/colors'
import { styles } from './styles'

const TimerSpan = ({
  timerId,
  recipe,
  componentIndex,
  stepIndex,
  stepText,
  seconds,
}: {
  timerId: string
  recipe: RecipeOut
  componentIndex: number
  stepIndex: number
  stepText: string
  seconds: number
}) => {
  const { t } = useTranslation()
  const { timers, startTimer, pauseTimer, resumeTimer } = useTimers()
  const timer = timers.get(timerId)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (timer?.status !== 'running') return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [timer?.status])

  if (!timer) {
    return (
      <Text
        style={styles.timerSpan}
        onPress={() =>
          startTimer({
            id: timerId,
            recipeId: recipe.id,
            recipeTitle: recipe.title,
            componentIndex,
            stepIndex,
            stepText,
            source: 'recipe',
            totalSeconds: seconds,
          })
        }
        accessibilityRole="button"
        accessibilityLabel={t('timers.startTimer')}
      >
        {`⏱ ${formatDurationLabel(seconds)}`}
      </Text>
    )
  }

  const remaining = getRemainingSeconds(timer)
  const isRunning = timer.status === 'running'
  const isDone = timer.status === 'done' || remaining === 0

  return (
    <Text
      style={[
        styles.timerSpan,
        { color: isDone ? '#10b981' : isRunning ? '#d97706' : colors.tertiaryLabel },
      ]}
      onPress={isDone ? undefined : () => (isRunning ? pauseTimer(timerId) : resumeTimer(timerId))}
      accessibilityRole="button"
      accessibilityLabel={isDone ? t('common.doneCheck') : isRunning ? t('common.pause') : t('common.resume')}
    >
      {isDone ? t('common.doneCheck') : `⏱ ${formatCountdown(remaining)}`}
    </Text>
  )
}

export default TimerSpan
