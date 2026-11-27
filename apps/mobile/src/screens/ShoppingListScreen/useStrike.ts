import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { NativeSyntheticEvent, TextLayoutEventData } from 'react-native'
import { useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { isMovePhase, type RowPhase } from './helpers'
import { buildStrikeLayout, isSameStrikeLayout, strikeDuration, type StrikeLayout } from './strikeHelpers'
import { STRIKE_EASING } from './motion'

interface UseStrikeParams {
  completed: boolean
  phase: RowPhase
}

export const useStrike = ({ completed, phase }: UseStrikeParams) => {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(completed && !isMovePhase(phase) ? 1 : 0)
  const [layout, setLayout] = useState<StrikeLayout | null>(null)
  const measuredRef = useRef<StrikeLayout | null>(null)
  const completedRef = useRef(completed)
  const previousPhaseRef = useRef(phase)

  completedRef.current = completed

  const handleTextLayout = useCallback((event: NativeSyntheticEvent<TextLayoutEventData>) => {
    const next = buildStrikeLayout(event.nativeEvent.lines)
    measuredRef.current = next
    if (completedRef.current) setLayout((current) => (isSameStrikeLayout(current, next) ? current : next))
  }, [])

  useLayoutEffect(() => {
    const wasMoving = isMovePhase(previousPhaseRef.current)
    previousPhaseRef.current = phase
    setLayout(completed ? measuredRef.current : null)

    if (!completed) {
      progress.value = 0
      return
    }

    if (isMovePhase(phase)) return

    const totalWidth = measuredRef.current?.totalWidth ?? 0
    if (!wasMoving || reduceMotion || totalWidth === 0) {
      progress.value = 1
      return
    }

    progress.value = 0
    progress.value = withTiming(1, { duration: strikeDuration(totalWidth), easing: STRIKE_EASING })
  }, [completed, phase, reduceMotion, progress])

  return { layout, progress, handleTextLayout }
}
