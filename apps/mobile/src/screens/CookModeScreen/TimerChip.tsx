import { memo, useCallback, useMemo, useRef } from 'react'
import { Pressable, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DurationMatch } from '@carrot/shared/utils/timerUtils'
import type { RecipeOut } from '@carrot/shared/types'
import { formatCountdown, formatDurationLabel, getRemainingSeconds, useTimers } from '../../context/TimerContext'
import { palette } from '../../theme'
import { buildTimerId, type CookStep } from './helpers'
import { styles } from './styles'
import useSecondTick from './useSecondTick'

const PRESS_GUARD_MS = 400

interface TimerChipProps {
  recipe: Pick<RecipeOut, 'id' | 'title'>
  step: CookStep
  duration: DurationMatch
  durationIndex: number
}

const TimerChip = ({ recipe, step, duration, durationIndex }: TimerChipProps) => {
  const { t } = useTranslation()
  const { timers, startTimer, pauseTimer, resumeTimer } = useTimers()
  const pressGuardRef = useRef(false)
  const id = buildTimerId(recipe.id, step, durationIndex)
  const timer = timers.get(id)
  const running = timer?.status === 'running'

  useSecondTick(running)

  const remaining = timer ? getRemainingSeconds(timer) : duration.seconds
  const done = timer !== undefined && (timer.status === 'done' || remaining === 0)

  const handlePress = useCallback(() => {
    if (pressGuardRef.current || done) return

    pressGuardRef.current = true
    setTimeout(() => {
      pressGuardRef.current = false
    }, PRESS_GUARD_MS)

    if (!timer) {
      startTimer({
        id,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        componentIndex: step.componentIndex,
        stepIndex: step.stepIndex,
        stepText: step.text,
        source: 'cook-mode',
        totalSeconds: duration.seconds,
      })
      return
    }

    if (running) pauseTimer(id)
    else resumeTimer(id)
  }, [done, duration.seconds, id, pauseTimer, recipe.id, recipe.title, resumeTimer, running, startTimer, step, timer])

  const presentation = useMemo(() => {
    if (done) {
      return {
        background: palette.successBg,
        foreground: palette.success,
        value: t('cookMode.timerDone'),
        hint: formatDurationLabel(duration.seconds),
      }
    }
    if (running) {
      return {
        background: palette.action,
        foreground: palette.onAction,
        value: formatCountdown(remaining),
        hint: t('cookMode.tapToPause'),
      }
    }
    if (timer) {
      return {
        background: palette.tint,
        foreground: palette.actionText,
        value: formatCountdown(remaining),
        hint: t('cookMode.timerPaused'),
      }
    }

    return {
      background: palette.tint,
      foreground: palette.actionText,
      value: formatDurationLabel(duration.seconds),
      hint: t('cookMode.timerTapToStart'),
    }
  }, [done, duration.seconds, remaining, running, t, timer])

  const chipStyle = useMemo(
    () => [styles.timerChip, { backgroundColor: presentation.background }],
    [presentation.background],
  )

  return (
    <Pressable
      style={chipStyle}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${presentation.value}, ${presentation.hint}`}
    >
      <Text style={[styles.timerValue, { color: presentation.foreground }]}>{presentation.value}</Text>
      <Text style={[styles.timerHint, { color: presentation.foreground }]}>{presentation.hint}</Text>
    </Pressable>
  )
}

export default memo(TimerChip)
