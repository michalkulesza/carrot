import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { useSharedValue, withTiming } from 'react-native-reanimated'
import {
  useSortableBoard,
  type DraxMonitorEventData,
  type DraxViewProps,
  type SortableBoardTransferEvent,
  type SortableDragPositionChangeEvent,
} from 'react-native-drax'
import {
  type ShoppingCategory,
  type ShoppingCategoryOrders,
  type ShoppingListItem,
} from '@carrot/shared/types'
import { mediumHaptic, selectionHaptic } from '../../components/ui/haptics'
import {
  aisleSortableId,
  categoryFromSortableId,
  categoryOrdersFromAisles,
  createCategoryValues,
  hasSameAisleOrder,
  shoppingItemKey,
  withReorderedAisle,
  withTransferredItem,
  type CategoryValues,
  type ShoppingAisle,
} from './helpers'
import { DRAG_MOVE_REARM_MS, DROP_SPACE_MS } from './motion'

interface UseShoppingDragParams {
  aisles: ShoppingAisle[]
  categories: ShoppingCategory[]
  incompleteItems: ShoppingListItem[]
  reduceMotion: boolean
  reorder: (categoryOrders: ShoppingCategoryOrders, options: { onError: () => void; onSettled: () => void }) => void
  dragActiveRef: MutableRefObject<boolean>
  onDragSettled: () => void
  onDragOver: (hoverY: number) => void
  onDragStop: () => void
}

const SESSION_FALLBACK_MS = 1000

export const useShoppingDrag = ({
  aisles,
  categories,
  incompleteItems,
  reduceMotion,
  reorder,
  dragActiveRef,
  onDragSettled,
  onDragOver,
  onDragStop,
}: UseShoppingDragParams) => {
  const [dragAisles, setDragAisles] = useState<ShoppingAisle[] | null>(null)
  const [scrollLocked, setScrollLocked] = useState(false)
  const dropSpaceRef = useRef<CategoryValues | null>(null)
  const displayedRef = useRef(aisles)
  const incompleteItemsRef = useRef(incompleteItems)
  const categoriesRef = useRef(categories)
  const reorderedRef = useRef(false)
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rearmRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moveBlocked = useSharedValue(false)
  const transferKeyRef = useRef('')
  const spaceTargetsRef = useRef(new Map<ShoppingCategory, number>())

  if (!dropSpaceRef.current) dropSpaceRef.current = createCategoryValues()
  const dropSpace = dropSpaceRef.current
  const displayedAisles = dragAisles ?? aisles

  displayedRef.current = displayedAisles
  incompleteItemsRef.current = incompleteItems
  categoriesRef.current = categories

  useEffect(() => {
    if (dragActiveRef.current) return
    setDragAisles((current) => (current && !hasSameAisleOrder(current, aisles) ? current : null))
  }, [aisles, dragActiveRef])

  useEffect(() => () => {
    if (fallbackRef.current) clearTimeout(fallbackRef.current)
    if (rearmRef.current) clearTimeout(rearmRef.current)
  }, [])

  const commit = useCallback((next: ShoppingAisle[]) => {
    reorderedRef.current = true
    setDragAisles(next)
    selectionHaptic()

    const categoryOrders = categoryOrdersFromAisles(next, categoriesRef.current, incompleteItemsRef.current)
    reorder(categoryOrders, {
      onError: () => setDragAisles(null),
      onSettled: () => {
        if (!dragActiveRef.current) setDragAisles(null)
      },
    })
  }, [reorder, dragActiveRef])

  const handleReorder = useCallback((category: ShoppingCategory, items: ShoppingListItem[]) => {
    commit(withReorderedAisle(displayedRef.current, category, items))
  }, [commit])

  const handleTransfer = useCallback(({ item, fromContainerId, toContainerId, toIndex }: SortableBoardTransferEvent<ShoppingListItem>) => {
    const from = categoryFromSortableId(fromContainerId)
    const to = categoryFromSortableId(toContainerId)
    if (!from || !to) return

    commit(withTransferredItem(displayedRef.current, { item, from, to, toIndex }))
  }, [commit])

  const board = useSortableBoard<ShoppingListItem>({ keyExtractor: shoppingItemKey, onTransfer: handleTransfer })
  const boardRef = useRef(board)
  boardRef.current = board

  const setSpace = useCallback((category: ShoppingCategory, target: number) => {
    if ((spaceTargetsRef.current.get(category) ?? 0) === target) return

    spaceTargetsRef.current.set(category, target)
    dropSpace[category].value = reduceMotion ? target : withTiming(target, { duration: DROP_SPACE_MS })
  }, [dropSpace, reduceMotion])

  const syncDropSpace = useCallback(() => {
    const transfer = boardRef.current._internal.transferState.current
    const key = transfer ? `${transfer.targetId}:${transfer.targetSlot}` : ''
    if (key === transferKeyRef.current) return

    transferKeyRef.current = key
    if (transfer) selectionHaptic()

    const height = transfer?.itemDimensions.height ?? 0
    for (const aisle of displayedRef.current) {
      const id = aisleSortableId(aisle.category)
      const isTarget = transfer?.targetId === id && !aisle.collapsed
      const isSource = transfer?.sourceId === id
      const target = isTarget ? height : isSource ? -height : 0
      setSpace(aisle.category, target)
    }
  }, [setSpace])

  const finishSession = useCallback(() => {
    if (!dragActiveRef.current) return

    if (fallbackRef.current) clearTimeout(fallbackRef.current)
    fallbackRef.current = null
    dragActiveRef.current = false
    transferKeyRef.current = ''
    spaceTargetsRef.current.clear()
    setScrollLocked(false)
    if (!reorderedRef.current) setDragAisles(null)
    reorderedRef.current = false
    // Drax flushes its permanent shifts into a real reorder 300 ms after the drop; that commit must not slide.
    rearmRef.current = setTimeout(() => {
      rearmRef.current = null
      moveBlocked.value = false
    }, DRAG_MOVE_REARM_MS)
    onDragSettled()
  }, [dragActiveRef, moveBlocked, onDragSettled])

  const handleDragStart = useCallback(() => {
    if (dragActiveRef.current) return

    dragActiveRef.current = true
    reorderedRef.current = false
    if (rearmRef.current) clearTimeout(rearmRef.current)
    rearmRef.current = null
    moveBlocked.value = true
    mediumHaptic()
    setScrollLocked(true)
    setDragAisles(displayedRef.current)
  }, [dragActiveRef, moveBlocked])

  const handleDragEnd = useCallback(() => {
    onDragStop()
    if (fallbackRef.current) clearTimeout(fallbackRef.current)
    fallbackRef.current = setTimeout(finishSession, SESSION_FALLBACK_MS)
  }, [finishSession, onDragStop])

  // Runs after Drax's own snap-end rAF, which delivers onReorder/onTransfer first.
  const handleSnapEnd = useCallback(() => {
    requestAnimationFrame(finishSession)
  }, [finishSession])

  const handlePositionChange = useCallback(({ toIndex, previousIndex }: SortableDragPositionChangeEvent<ShoppingListItem>) => {
    if (toIndex !== undefined && previousIndex !== undefined) selectionHaptic()
  }, [])

  const handleBoardDragOver = useCallback((event: DraxMonitorEventData) => {
    queueMicrotask(syncDropSpace)
    onDragOver(event.dragAbsolutePosition.y)
  }, [syncDropSpace, onDragOver])

  const handleBoardDragEnd = useCallback(() => {
    queueMicrotask(syncDropSpace)
    onDragStop()
    return undefined
  }, [syncDropSpace, onDragStop])

  const boardViewProps = useMemo<Partial<DraxViewProps>>(() => ({
    onMonitorDragOver: handleBoardDragOver,
    onMonitorDragEnd: handleBoardDragEnd,
    onMonitorDragDrop: handleBoardDragEnd,
  }), [handleBoardDragOver, handleBoardDragEnd])

  return {
    board,
    boardViewProps,
    displayedAisles,
    dropSpace,
    moveBlocked,
    scrollLocked,
    handleDragStart,
    handleDragEnd,
    handleSnapEnd,
    handleReorder,
    handlePositionChange,
  }
}
