import { memo, useMemo } from 'react'
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated'
import { styles } from './styles'

const HIGHLIGHT_MS = 300

const SwapHighlight = () => {
  const reduceMotion = useReducedMotion()
  const duration = reduceMotion ? 0 : HIGHLIGHT_MS

  const entering = useMemo(() => FadeIn.duration(duration), [duration])
  const exiting = useMemo(() => FadeOut.duration(duration), [duration])

  return <Animated.View style={styles.swapHighlight} entering={entering} exiting={exiting} pointerEvents="none" />
}

export default memo(SwapHighlight)
