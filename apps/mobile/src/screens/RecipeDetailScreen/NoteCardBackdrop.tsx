import { memo, useEffect, useMemo } from 'react'
import { View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'
import { useResolvedColorScheme } from '../../context/ColorSchemeContext'
import { paletteTones } from '../../theme'
import { styles } from './styles'

const TONE_MS = 350
const RING_MS = 200

const NoteCardBackdrop = ({ open, editing }: { open: boolean; editing: boolean }) => {
  const reduceMotion = useReducedMotion()
  const scheme = useResolvedColorScheme()
  const tone = useSharedValue(open ? 1 : 0)
  const ring = useSharedValue(editing ? 1 : 0)

  useEffect(() => {
    const toneTarget = open ? 1 : 0
    const ringTarget = editing ? 1 : 0

    if (reduceMotion) {
      tone.value = toneTarget
      ring.value = ringTarget
      return
    }

    tone.value = withTiming(toneTarget, { duration: TONE_MS, easing: Easing.out(Easing.cubic) })
    ring.value = withTiming(ringTarget, { duration: RING_MS })
  }, [open, editing, reduceMotion, tone, ring])

  const ringColorStyle = useMemo(
    () => [styles.noteLayerFill, styles.noteRing, { borderColor: paletteTones.noteRing[scheme === 'dark' ? 1 : 0] }],
    [scheme],
  )
  const toneStyle = useAnimatedStyle(() => ({ opacity: tone.value }))
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value }))

  return (
    <>
      <View pointerEvents="none" style={[styles.noteLayerFill, styles.noteBackdropClosed]} />
      <Animated.View pointerEvents="none" style={[styles.noteLayerFill, toneStyle]}>
        <View style={[styles.noteLayerFill, styles.noteBackdropOpen]} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.noteLayerFill, ringStyle]}>
        <View style={ringColorStyle} />
      </Animated.View>
    </>
  )
}

export default memo(NoteCardBackdrop)
