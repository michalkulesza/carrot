import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Gesture } from 'react-native-gesture-handler'
import {
  runOnJS,
  scrollTo,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type AnimatedRef,
} from 'react-native-reanimated'
import type Animated from 'react-native-reanimated'

const LONG_PRESS_MS = 300
const AUTO_SCROLL_EDGE = 80
const AUTO_SCROLL_MAX_SPEED = 12
export const PREVIEW_HEIGHT = 64

interface DayLayout {
  iso: string
  top: number
  height: number
}

export interface DraggingState {
  entryId: string
  fromIso: string
}

const triggerLift = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
const triggerHover = () => void Haptics.selectionAsync()
const triggerDrop = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

const findHoveredIso = (layouts: DayLayout[], contentY: number): string => {
  'worklet'
  for (const layout of layouts) {
    if (contentY >= layout.top && contentY <= layout.top + layout.height) return layout.iso
  }

  return ''
}

export const useDragToMove = ({
  scrollRef,
  coveredTop,
  coveredBottom,
  onDrop,
}: {
  scrollRef: AnimatedRef<Animated.ScrollView>
  coveredTop: number
  coveredBottom: number
  onDrop: (entryId: string, toIso: string) => void
}) => {
  const [dragging, setDragging] = useState<DraggingState | null>(null)
  const [hoverIso, setHoverIso] = useState<string | null>(null)

  const containerRef = useRef<View>(null)
  const layoutsRef = useRef(new Map<string, DayLayout>())
  const daysTopRef = useRef(0)

  const scrollGesture = useMemo(() => Gesture.Native(), [])

  const scrollY = useSharedValue(0)
  const containerTop = useSharedValue(0)
  const containerHeight = useSharedValue(0)
  const contentHeight = useSharedValue(0)
  const pointerY = useSharedValue(0)
  const isDragging = useSharedValue(false)
  const hovered = useSharedValue('')
  const layouts = useSharedValue<DayLayout[]>([])
  const coveredTopValue = useSharedValue(coveredTop)
  const coveredBottomValue = useSharedValue(coveredBottom)

  useEffect(() => {
    coveredTopValue.value = coveredTop
    coveredBottomValue.value = coveredBottom
  }, [coveredTop, coveredBottom, coveredTopValue, coveredBottomValue])

  const publishLayouts = useCallback(() => {
    layouts.value = Array.from(layoutsRef.current.values()).map((layout) => ({
      ...layout,
      top: layout.top + daysTopRef.current,
    }))
  }, [layouts])

  const registerDayLayout = useCallback(
    (iso: string, top: number, height: number) => {
      layoutsRef.current.set(iso, { iso, top, height })
      publishLayouts()
    },
    [publishLayouts],
  )

  const handleDaysLayout = useCallback(
    (e: LayoutChangeEvent) => {
      daysTopRef.current = e.nativeEvent.layout.y
      publishLayouts()
    },
    [publishLayouts],
  )

  const pruneDayLayouts = useCallback(
    (visibleIsos: string[]) => {
      const visible = new Set(visibleIsos)
      for (const iso of layoutsRef.current.keys()) {
        if (!visible.has(iso)) layoutsRef.current.delete(iso)
      }
      publishLayouts()
    },
    [publishLayouts],
  )

  const measureContainer = useCallback(() => {
    containerRef.current?.measureInWindow((_x, y) => {
      containerTop.value = y
    })
  }, [containerTop])

  const handleContainerLayout = useCallback(
    (e: LayoutChangeEvent) => {
      containerHeight.value = e.nativeEvent.layout.height
      measureContainer()
    },
    [containerHeight, measureContainer],
  )

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.value = height
    },
    [contentHeight],
  )

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
    },
  })

  const handleLift = useCallback(
    (entryId: string, fromIso: string) => {
      measureContainer()
      setDragging({ entryId, fromIso })
    },
    [measureContainer],
  )

  const handleHoverChange = useCallback((iso: string) => setHoverIso(iso || null), [])

  const handleDrop = useCallback(
    (entryId: string, toIso: string) => {
      triggerDrop()
      onDrop(entryId, toIso)
    },
    [onDrop],
  )

  const handleEnd = useCallback(() => {
    setDragging(null)
    setHoverIso(null)
  }, [])

  const updateHover = useCallback(() => {
    'worklet'
    const viewportY = pointerY.value - containerTop.value
    const covered = viewportY < coveredTopValue.value || viewportY > containerHeight.value - coveredBottomValue.value
    const iso = covered ? '' : findHoveredIso(layouts.value, viewportY + scrollY.value)
    if (iso === hovered.value) return

    hovered.value = iso
    runOnJS(handleHoverChange)(iso)
    if (iso) runOnJS(triggerHover)()
  }, [pointerY, containerTop, containerHeight, scrollY, layouts, coveredTopValue, coveredBottomValue, hovered, handleHoverChange])

  useFrameCallback(() => {
    'worklet'
    if (!isDragging.value) return

    const y = pointerY.value - containerTop.value
    const distanceToTop = y - coveredTopValue.value
    const distanceToBottom = containerHeight.value - coveredBottomValue.value - y
    let delta = 0
    if (distanceToTop < AUTO_SCROLL_EDGE) {
      delta = -AUTO_SCROLL_MAX_SPEED * (1 - Math.max(distanceToTop, 0) / AUTO_SCROLL_EDGE)
    } else if (distanceToBottom < AUTO_SCROLL_EDGE) {
      delta = AUTO_SCROLL_MAX_SPEED * (1 - Math.max(distanceToBottom, 0) / AUTO_SCROLL_EDGE)
    }
    if (delta === 0) return

    const maxScroll = Math.max(0, contentHeight.value - containerHeight.value)
    const next = Math.min(Math.max(scrollY.value + delta, 0), maxScroll)
    scrollY.value = next
    scrollTo(scrollRef, 0, next, false)
    updateHover()
  })

  const createGesture = useCallback(
    (entryId: string, fromIso: string) =>
      Gesture.Pan()
        .activateAfterLongPress(LONG_PRESS_MS)
        .blocksExternalGesture(scrollGesture)
        .onStart((e) => {
          pointerY.value = e.absoluteY
          hovered.value = ''
          isDragging.value = true
          runOnJS(triggerLift)()
          runOnJS(handleLift)(entryId, fromIso)
          updateHover()
        })
        .onUpdate((e) => {
          pointerY.value = e.absoluteY
          updateHover()
        })
        .onEnd((_e, success) => {
          const toIso = hovered.value
          if (success && toIso && toIso !== fromIso) runOnJS(handleDrop)(entryId, toIso)
        })
        .onFinalize(() => {
          if (!isDragging.value) return

          isDragging.value = false
          hovered.value = ''
          runOnJS(handleEnd)()
        }),
    [scrollGesture, pointerY, hovered, isDragging, handleLift, updateHover, handleDrop, handleEnd],
  )

  const previewStyle = useAnimatedStyle(() => ({
    opacity: isDragging.value ? 1 : 0,
    transform: [
      { translateY: pointerY.value - containerTop.value - PREVIEW_HEIGHT / 2 },
      { scale: isDragging.value ? 1.03 : 1 },
    ],
  }))

  return {
    dragging,
    hoverIso,
    containerRef,
    scrollGesture,
    previewStyle,
    createGesture,
    registerDayLayout,
    pruneDayLayouts,
    handleDaysLayout,
    handleContainerLayout,
    handleContentSizeChange,
    scrollHandler,
  }
}

export type DragToMove = ReturnType<typeof useDragToMove>
