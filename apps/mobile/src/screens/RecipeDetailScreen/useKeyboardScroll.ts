import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView, type View } from 'react-native'
import type { ScrollIntoViewActions } from './ScrollIntoViewContext'

const KEYBOARD_BREATHING_ROOM = 24

export const KEYBOARD_SCROLL_EVENT_THROTTLE = 32

export const useKeyboardScroll = () => {
  const scrollRef = useRef<ScrollView>(null)
  const targetRef = useRef<View | null>(null)
  const offsetRef = useRef(0)

  const scrollTargetAboveKeyboard = useCallback(() => {
    const target = targetRef.current
    const keyboard = Keyboard.metrics()
    if (!target || !keyboard) return

    target.measureInWindow((_x, y, _width, height) => {
      if (targetRef.current !== target) return

      const overflow = y + height + KEYBOARD_BREATHING_ROOM - keyboard.screenY
      if (overflow > 0) scrollRef.current?.scrollTo({ y: offsetRef.current + overflow, animated: true })
    })
  }, [])

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', scrollTargetAboveKeyboard)

    return () => subscription.remove()
  }, [scrollTargetAboveKeyboard])

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = event.nativeEvent.contentOffset.y
  }, [])

  const handleTouchStart = useCallback(() => {
    if (targetRef.current) Keyboard.dismiss()
  }, [])

  const scrollIntoView = useCallback(
    (target: View | null) => {
      targetRef.current = target
      scrollTargetAboveKeyboard()
    },
    [scrollTargetAboveKeyboard],
  )

  const release = useCallback(() => {
    targetRef.current = null
  }, [])

  const actions = useMemo<ScrollIntoViewActions>(() => ({ scrollIntoView, release }), [scrollIntoView, release])

  return { scrollRef, handleScroll, handleTouchStart, actions }
}
