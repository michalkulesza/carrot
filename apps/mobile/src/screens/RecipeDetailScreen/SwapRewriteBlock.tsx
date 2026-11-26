import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import {
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
  type TextLayoutLine,
} from 'react-native'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { settleEasing } from '../../theme'
import SwapLineDecorations from './SwapLineDecorations'
import { styles } from './styles'
import { SWAP_OLD_GONE_MS, SWAP_RESIZE_MS, useSwapRewriteAnimation, type SwapRewrite } from './useSwapRewriteAnimation'

type Phase = 'measuring' | 'animating' | 'settled'

interface SwapRewriteBlockProps {
  rewrite: SwapRewrite
  nameStyle: ComponentProps<typeof Animated.Text>['style']
  oldName: string
  newName: string
  oldExtra: ReactNode
  newExtra: ReactNode
}

const SwapRewriteBlock = ({ rewrite, nameStyle, oldName, newName, oldExtra, newExtra }: SwapRewriteBlockProps) => {
  const decorated = rewrite.direction === 'swap'
  const [oldHeight, setOldHeight] = useState<number | null>(null)
  const [newHeight, setNewHeight] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('measuring')
  const [oldLines, setOldLines] = useState<TextLayoutLine[]>([])
  const [newLines, setNewLines] = useState<TextLayoutLine[]>([])
  const height = useSharedValue(-1)
  const startedAtRef = useRef<number | null>(null)
  const settledRef = useRef(false)
  const crossfadeDelayRef = useRef<number | null>(null)

  const measured = oldHeight !== null && newHeight !== null
  if (measured && crossfadeDelayRef.current === null) {
    crossfadeDelayRef.current = rewrite.delayMs + (newHeight > oldHeight ? SWAP_RESIZE_MS : 0)
  }
  const { strikeStyle, oldStyle, newStyle, markStyle } = useSwapRewriteAnimation(crossfadeDelayRef.current)

  const settle = useCallback(() => {
    settledRef.current = true
    setPhase('settled')
  }, [])

  useEffect(() => {
    if (oldHeight === null || newHeight === null || settledRef.current) return

    const startedAt = startedAtRef.current ?? Date.now()
    const isFirstRun = startedAtRef.current === null
    startedAtRef.current = startedAt

    // Grow before the crossfade so nothing spills out; shrink only once the taller old text has faded.
    const resizeAt = startedAt + rewrite.delayMs + (newHeight > oldHeight ? 0 : SWAP_OLD_GONE_MS)
    if (isFirstRun) height.value = oldHeight
    height.value = withDelay(
      Math.max(0, resizeAt - Date.now()),
      withTiming(newHeight, { duration: SWAP_RESIZE_MS, easing: settleEasing }, (finished) => {
        if (finished) runOnJS(settle)()
      }),
    )
    setPhase('animating')
  }, [oldHeight, newHeight, rewrite.delayMs, height, settle])

  const heightStyle = useAnimatedStyle(() => (height.value < 0 ? {} : { height: height.value }))
  const startHeightStyle = useMemo(() => ({ height: oldHeight ?? undefined }), [oldHeight])
  const containerStyle = useMemo(
    () => (phase === 'animating' ? [startHeightStyle, heightStyle] : undefined),
    [phase, startHeightStyle, heightStyle],
  )

  const oldPositionStyle = phase === 'measuring' ? styles.swapBlock : styles.swapOldBlock
  const newPositionStyle = phase === 'settled' ? styles.swapBlock : styles.swapOldBlock
  const oldBlockStyle = useMemo(() => [oldPositionStyle, oldStyle], [oldPositionStyle, oldStyle])
  const newBlockStyle = useMemo(
    () => [newPositionStyle, styles.swapIncomingStart, newStyle],
    [newPositionStyle, newStyle],
  )

  const handleOldLayout = useCallback((event: LayoutChangeEvent) => {
    const measuredHeight = event.nativeEvent.layout.height
    setOldHeight(measuredHeight)
  }, [])
  const handleNewLayout = useCallback((event: LayoutChangeEvent) => {
    const measuredHeight = event.nativeEvent.layout.height
    setNewHeight(measuredHeight)
  }, [])
  const handleOldTextLayout = useCallback(
    (event: NativeSyntheticEvent<TextLayoutEventData>) => setOldLines(event.nativeEvent.lines),
    [],
  )
  const handleNewTextLayout = useCallback(
    (event: NativeSyntheticEvent<TextLayoutEventData>) => setNewLines(event.nativeEvent.lines),
    [],
  )

  return (
    <Animated.View style={containerStyle}>
      <Animated.View
        style={oldBlockStyle}
        onLayout={handleOldLayout}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.swapNameWrap}>
          <Animated.Text style={nameStyle} onTextLayout={decorated ? handleOldTextLayout : undefined}>
            {oldName}
          </Animated.Text>
          {decorated ? (
            <SwapLineDecorations lines={oldLines} variant="strike" style={styles.swapStrike} animatedStyle={strikeStyle} />
          ) : null}
        </View>
        {oldExtra}
      </Animated.View>
      <Animated.View style={newBlockStyle} onLayout={handleNewLayout}>
        <View style={styles.swapNameWrap}>
          {decorated ? (
            <SwapLineDecorations lines={newLines} variant="mark" style={styles.swapMark} animatedStyle={markStyle} />
          ) : null}
          <Animated.Text style={nameStyle} onTextLayout={decorated ? handleNewTextLayout : undefined}>
            {newName}
          </Animated.Text>
        </View>
        {newExtra}
      </Animated.View>
    </Animated.View>
  )
}

export default memo(SwapRewriteBlock)
