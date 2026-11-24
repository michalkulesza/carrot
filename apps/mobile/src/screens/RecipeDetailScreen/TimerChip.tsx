import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, Text } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { formatCountdown, formatDurationLabel, getRemainingSeconds, useTimers } from '../../context/TimerContext'
import { palette, usePressScale } from '../../theme'
import { lightHaptic } from '../../components/ui/haptics'
import { styles } from './styles'

interface TimerChipProps {
  timerId: string
  recipeId: string
  recipeTitle: string
  componentIndex: number
  stepIndex: number
  stepText: string
  seconds: number
}

type ChipState = 'idle' | 'running' | 'paused' | 'done'

const ICON_SIZE = 15

const BACKGROUNDS: Record<ChipState, string> = {
  idle: palette.tint,
  paused: palette.tint,
  running: palette.action,
  done: palette.successBg,
}

const FOREGROUNDS: Record<ChipState, string> = {
  idle: palette.actionText,
  paused: palette.actionText,
  running: palette.onAction,
  done: palette.success,
}

const TimerChip = ({ timerId, recipeId, recipeTitle, componentIndex, stepIndex, stepText, seconds }: TimerChipProps) => {
  const { t } = useTranslation()
  const { timers, startTimer, pauseTimer, resumeTimer } = useTimers()
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()
  const timer = timers.get(timerId)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (timer?.status !== 'running') return
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [timer?.status])

  const remaining = timer ? getRemainingSeconds(timer) : seconds
  const state: ChipState = !timer ? 'idle' : timer.status === 'done' || remaining === 0 ? 'done' : timer.status

  const handlePress = useCallback(() => {
    lightHaptic()
    if (!timer) {
      startTimer({
        id: timerId,
        recipeId,
        recipeTitle,
        componentIndex,
        stepIndex,
        stepText,
        source: 'recipe',
        totalSeconds: seconds,
      })
      return
    }
    if (state === 'running') pauseTimer(timerId)
    else if (state === 'paused') resumeTimer(timerId)
  }, [timer, state, startTimer, pauseTimer, resumeTimer, timerId, recipeId, recipeTitle, componentIndex, stepIndex, stepText, seconds])

  const containerStyle = useMemo(
    () => [styles.timerChip, { backgroundColor: BACKGROUNDS[state] }, animatedStyle],
    [state, animatedStyle],
  )
  const textStyle = useMemo(() => [styles.timerChipText, { color: FOREGROUNDS[state] }], [state])

  const label = state === 'idle' ? formatDurationLabel(seconds) : state === 'done' ? t('timers.doneShort') : formatCountdown(remaining)
  const accessibilityLabel =
    state === 'done' ? t('common.doneCheck') : state === 'running' ? t('common.pause') : state === 'paused' ? t('common.resume') : t('timers.startTimer')

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={state === 'done'}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}, ${label}`}
    >
      <Animated.View style={containerStyle}>
        <SymbolView name={state === 'done' ? 'checkmark' : 'timer'} size={ICON_SIZE} weight="semibold" tintColor={FOREGROUNDS[state]} />
        <Text style={textStyle}>{label}</Text>
      </Animated.View>
    </Pressable>
  )
}

export default memo(TimerChip)
