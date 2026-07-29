import { useCallback, useMemo, useState, type ComponentType, type RefObject } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Gesture } from 'react-native-gesture-handler'
import Animated, {
  scrollTo,
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import type { MealPlanEntry } from '@carrot/shared/types'
import { DRAG_HANDLE_ZONE_WIDTH, findDayIndexAtContentY, type ListItem } from './helpers'

const AUTO_SCROLL_EDGE = 80
const AUTO_SCROLL_MAX_SPEED = 12

const triggerLightImpact = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
const triggerSelection = () => void Haptics.selectionAsync()
const triggerSuccess = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

export const useDragToMove = ({
  listRef,
  items,
  offsets,
  contentHeight,
  entriesByDate,
  onDrop,
}: {
  listRef: ReturnType<typeof useAnimatedRef<Animated.FlatList<ListItem>>>
  items: ListItem[]
  offsets: number[]
  contentHeight: number
  entriesByDate: Map<string, MealPlanEntry>
  onDrop: (from: string, to: string) => void
}) => {
  const [draggingIsoDate, setDraggingIsoDate] = useState<string | null>(null)
  // Set as soon as the finger touches down (before the long-press activates), purely so
  // DragPreviewCard's NetworkImage can start loading while the card is still invisible.
  // draggingIsoDate (which also ghosts the source row) only flips once the drag is real.
  const [previewIsoDate, setPreviewIsoDate] = useState<string | null>(null)

  const scrollY = useSharedValue(0)
  const containerHeight = useSharedValue(0)
  const dragY = useSharedValue(0)
  const dragTranslate = useSharedValue(0)
  const hoveredIndex = useSharedValue(-1)
  const sourceIndex = useSharedValue(-1)
  const sourceOffset = useSharedValue(0)
  const isDragging = useSharedValue(false)

  const isoDateAt = useMemo(
    () => items.map((item) => (item.type === 'day' ? item.isoDate : null)),
    [items],
  )
  const hasEntryAt = useMemo(
    () => items.map((item) => item.type === 'day' && entriesByDate.has(item.isoDate)),
    [items, entriesByDate],
  )

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y
    },
  })

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    containerHeight.value = e.nativeEvent.layout.height
  }, [containerHeight])

  const handleDrop = useCallback(
    (from: string, to: string) => {
      onDrop(from, to)
    },
    [onDrop],
  )

  useFrameCallback(() => {
    'worklet'
    if (!isDragging.value) return

    const top = dragY.value
    const bottom = containerHeight.value - dragY.value
    let delta = 0
    if (top < AUTO_SCROLL_EDGE) {
      delta = -AUTO_SCROLL_MAX_SPEED * (1 - top / AUTO_SCROLL_EDGE)
    } else if (bottom < AUTO_SCROLL_EDGE) {
      delta = AUTO_SCROLL_MAX_SPEED * (1 - bottom / AUTO_SCROLL_EDGE)
    }
    if (delta === 0) return

    const maxScroll = Math.max(0, contentHeight - containerHeight.value)
    const next = Math.min(Math.max(scrollY.value + delta, 0), maxScroll)
    scrollY.value = next
    scrollTo(listRef, 0, next, false)

    const contentY = dragY.value + next
    const idx = findDayIndexAtContentY(offsets, items, contentY)
    if (idx >= 0 && isoDateAt[idx] != null && idx !== hoveredIndex.value) {
      hoveredIndex.value = idx
    }
  })

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(300)
        // Only the drag-handle strip at the right edge of each row can start a drag —
        // this shrinks the gesture's own touch-recognition area so everything else
        // (thumbnail, title, the row's own tap-to-open-actions) is left completely alone.
        .hitSlop({ right: 0, width: DRAG_HANDLE_ZONE_WIDTH })
        .blocksExternalGesture(listRef as unknown as RefObject<ComponentType<object> | null | undefined>)
        .onBegin((e) => {
          dragY.value = e.y

          const contentY = e.y + scrollY.value
          const idx = findDayIndexAtContentY(offsets, items, contentY)
          if (idx >= 0 && hasEntryAt[idx]) {
            runOnJS(setPreviewIsoDate)(isoDateAt[idx])
          }
        })
        .onStart((e) => {
          const contentY = e.y + scrollY.value
          const idx = findDayIndexAtContentY(offsets, items, contentY)
          if (idx < 0 || !hasEntryAt[idx]) return

          sourceIndex.value = idx
          sourceOffset.value = offsets[idx]
          hoveredIndex.value = idx
          isDragging.value = true
          dragTranslate.value = 0
          runOnJS(triggerLightImpact)()
          runOnJS(setDraggingIsoDate)(isoDateAt[idx])
        })
        .onUpdate((e) => {
          dragY.value = e.y
          if (!isDragging.value) return

          dragTranslate.value = e.translationY

          const contentY = e.y + scrollY.value
          const idx = findDayIndexAtContentY(offsets, items, contentY)
          const isValidDay = idx >= 0 && isoDateAt[idx] != null

          if (isValidDay && idx !== hoveredIndex.value) {
            hoveredIndex.value = idx
            runOnJS(triggerSelection)()
          } else if (!isValidDay && hoveredIndex.value !== -1) {
            hoveredIndex.value = -1
          }
        })
        .onEnd(() => {
          if (!isDragging.value) return

          const srcIdx = sourceIndex.value
          const targetIdx = hoveredIndex.value
          const fromIso = isoDateAt[srcIdx]
          const toIso = targetIdx >= 0 ? isoDateAt[targetIdx] : null

          if (fromIso != null && toIso != null && toIso !== fromIso) {
            dragTranslate.value = withTiming(offsets[targetIdx] - sourceOffset.value, { duration: 150 })
            runOnJS(triggerSuccess)()
            runOnJS(handleDrop)(fromIso, toIso)
          } else {
            dragTranslate.value = withSpring(0)
          }
        })
        .onFinalize(() => {
          isDragging.value = false
          hoveredIndex.value = -1
          sourceIndex.value = -1
          runOnJS(setDraggingIsoDate)(null)
          runOnJS(setPreviewIsoDate)(null)
        }),
    [
      listRef,
      offsets,
      items,
      isoDateAt,
      hasEntryAt,
      dragY,
      dragTranslate,
      hoveredIndex,
      sourceIndex,
      sourceOffset,
      isDragging,
      scrollY,
      handleDrop,
    ],
  )

  const previewCardStyle = useAnimatedStyle(() => ({
    opacity: isDragging.value ? 1 : 0,
    transform: [
      { translateY: sourceOffset.value - scrollY.value + dragTranslate.value },
      { scale: isDragging.value ? 1.03 : 1 },
    ],
  }))

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: hoveredIndex.value >= 0 && isDragging.value ? 1 : 0,
    transform: [
      { translateY: (offsets[hoveredIndex.value] ?? 0) - scrollY.value },
    ],
  }))

  return {
    draggingIsoDate,
    previewIsoDate,
    gesture,
    scrollHandler,
    handleContainerLayout,
    previewCardStyle,
    highlightStyle,
  }
}
