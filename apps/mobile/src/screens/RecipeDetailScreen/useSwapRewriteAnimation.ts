import { useEffect, useMemo } from 'react'
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

const STRIKE_MS = 260
const OLD_MS = 600
const OLD_FADE_START = 0.55
const OLD_LIFT = -4
const NEW_START_MS = 480
const NEW_MS = 380
const MARK_START_MS = 560
const MARK_MS = 1100
const MARK_GROW_END = 0.55

export interface SwapRewrite {
  id: number
  delayMs: number
  direction: 'swap' | 'restore'
}

export const SWAP_STAGGER_MS = 150
export const SWAP_RESIZE_MS = 260
export const SWAP_OLD_GONE_MS = OLD_MS
export const SWAP_REWRITE_TOTAL_MS = SWAP_RESIZE_MS + MARK_START_MS + MARK_MS
const TIMELINE_MS = MARK_START_MS + MARK_MS

const easeOut = Easing.out(Easing.cubic)

const progressAt = (elapsed: number, start: number, duration: number) => {
  'worklet'
  return Math.min(1, Math.max(0, (elapsed - start) / duration))
}

export const useSwapRewriteAnimation = (startDelayMs: number | null) => {
  const elapsed = useSharedValue(0)

  useEffect(() => {
    if (startDelayMs === null) return

    elapsed.value = withDelay(startDelayMs, withTiming(TIMELINE_MS, { duration: TIMELINE_MS, easing: Easing.linear }))
  }, [startDelayMs, elapsed])

  const strikeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: easeOut(progressAt(elapsed.value, 0, STRIKE_MS)) }],
  }))
  const oldStyle = useAnimatedStyle(() => {
    const fade = Math.max(0, progressAt(elapsed.value, 0, OLD_MS) - OLD_FADE_START) / (1 - OLD_FADE_START)

    return { opacity: 1 - fade, transform: [{ translateY: fade * OLD_LIFT }] }
  })
  const newStyle = useAnimatedStyle(() => ({
    opacity: easeOut(progressAt(elapsed.value, NEW_START_MS, NEW_MS)),
  }))
  const markStyle = useAnimatedStyle(() => {
    const p = easeOut(progressAt(elapsed.value, MARK_START_MS, MARK_MS))
    const fade = Math.max(0, p - MARK_GROW_END) / (1 - MARK_GROW_END)

    return { opacity: 1 - fade, transform: [{ scaleX: Math.min(1, p / MARK_GROW_END) }] }
  })

  return useMemo(() => ({ strikeStyle, oldStyle, newStyle, markStyle }), [strikeStyle, oldStyle, newStyle, markStyle])
}
