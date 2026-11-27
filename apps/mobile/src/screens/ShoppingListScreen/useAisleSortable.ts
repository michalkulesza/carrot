import { useCallback, useEffect, useRef } from 'react'
import type { View } from 'react-native'
import {
  useDraxContext,
  useSortableList,
  type SortableDragPositionChangeEvent,
  type SortableListHandle,
  type SortableReorderEvent,
} from 'react-native-drax'
import type { ShoppingCategory, ShoppingListItem } from '@carrot/shared/types'
import { aisleSortableId, shoppingItemKey } from './helpers'
import { LONG_PRESS_MS } from './motion'
import type { DragGeometry } from './useDragGeometry'

type SortableInternal = SortableListHandle<ShoppingListItem>['_internal']

interface MeasuredRect {
  x: number
  y: number
  width: number
  height: number
  scrollAt: number
}

interface UseAisleSortableParams {
  category: ShoppingCategory
  items: ShoppingListItem[]
  rows: ShoppingListItem[]
  collapsed: boolean
  reduceMotion: boolean
  geometry: DragGeometry
  onReorder: (category: ShoppingCategory, items: ShoppingListItem[]) => void
  onPositionChange: (event: SortableDragPositionChangeEvent<ShoppingListItem>) => void
}

// Drax 1.1.0 assumes each sortable column is its own scroll container placed in root coordinates; these aisles sit
// inside one shared ScrollView, so the slot, snap and finalize hooks are adapted here (see the spec, section 2.7).
const adaptInternal = (
  internal: SortableInternal,
  collapsedRef: { current: boolean },
  reorderableCountRef: { current: number },
  finalizeRef: { current: (() => void) | undefined },
  finalizeTrampoline: () => void,
) => {
  const baseSlot = internal.getSlotFromPosition
  const basePhantomSnap = internal.getPhantomSnapTarget

  const slotFromPosition: typeof baseSlot = (position) => {
    const pending = internal.pendingOrderRef.current
    if (collapsedRef.current) return pending.length

    const incoming = internal.draggedDisplayIndexRef.current === undefined
    if (!incoming || pending.length === 0) return baseSlot(position)

    const bottom = pending.reduce((lowest, originalIndex) => {
      const measurement = internal.getMeasurementByOriginalIndex(originalIndex)
      return measurement ? Math.max(lowest, measurement.y + measurement.height) : lowest
    }, 0)
    return position.y > bottom ? pending.length : baseSlot(position)
  }

  internal.getSlotFromPosition = (position) => Math.min(slotFromPosition(position), reorderableCountRef.current)

  internal.getPhantomSnapTarget = () => {
    const bounds = internal.containerMeasurementsRef.current
    if (collapsedRef.current && bounds) return { x: bounds.x, y: bounds.y }
    return basePhantomSnap()
  }

  // SortableItem reads onItemSnapEnd during render, before SortableContainer assigns it in a layout effect.
  Object.defineProperty(internal, 'onItemSnapEnd', {
    configurable: true,
    enumerable: true,
    get: () => finalizeTrampoline,
    set: (finalize: (() => void) | undefined) => { finalizeRef.current = finalize },
  })
}

export const useAisleSortable = ({
  category,
  items,
  rows,
  collapsed,
  reduceMotion,
  geometry,
  onReorder,
  onPositionChange,
}: UseAisleSortableParams) => {
  const { updateMeasurements, rootOffsetSV } = useDraxContext()
  const bodyRef = useRef<View>(null)
  const cardRef = useRef<View>(null)
  const collapsedRef = useRef(collapsed)
  const reorderableCountRef = useRef(items.length)
  const reorderableIdsRef = useRef(new Set<string>())
  const finalizeRef = useRef<(() => void) | undefined>(undefined)
  const measuredRef = useRef<MeasuredRect | null>(null)
  const frameRef = useRef<number | null>(null)

  collapsedRef.current = collapsed
  reorderableCountRef.current = items.length
  reorderableIdsRef.current = new Set(items.map((item) => item.id))

  const handleReorder = useCallback(
    ({ data }: SortableReorderEvent<ShoppingListItem>) => onReorder(category, data.filter((item) => reorderableIdsRef.current.has(item.id))),
    [category, onReorder],
  )

  const sortable = useSortableList({
    id: aisleSortableId(category),
    data: rows,
    keyExtractor: shoppingItemKey,
    onReorder: handleReorder,
    onDragPositionChange: onPositionChange,
    longPressDelay: LONG_PRESS_MS,
    animationConfig: reduceMotion ? 'none' : 'default',
    autoScrollBackThreshold: -1,
    autoScrollForwardThreshold: 2,
  })

  const internalRef = useRef(sortable._internal)
  internalRef.current = sortable._internal

  const finalizeTrampoline = useCallback(() => finalizeRef.current?.(), [])
  adaptInternal(sortable._internal, collapsedRef, reorderableCountRef, finalizeRef, finalizeTrampoline)

  const publish = useCallback(() => {
    const measured = measuredRef.current
    if (!measured) return

    const scrolled = (geometry.scrollYRef.current ?? 0) - measured.scrollAt
    const rect = { x: measured.x, y: measured.y - scrolled, width: measured.width, height: measured.height, _transformDetected: 0 }

    updateMeasurements(internalRef.current.id, rect)
    internalRef.current.containerMeasurementsRef.current = rect
  }, [geometry, updateMeasurements])

  // Drax's own measureLayout ignores the ScrollView offset, so the column bounds are re-measured on screen and pushed back.
  const measure = useCallback(() => {
    const target = collapsedRef.current ? cardRef.current : bodyRef.current
    target?.measure((_x, _y, width, height, pageX, pageY) => {
      const root = rootOffsetSV.value
      measuredRef.current = {
        x: pageX - root.x,
        y: pageY - root.y,
        width,
        height,
        scrollAt: geometry.scrollYRef.current ?? 0,
      }
      publish()
    })
  }, [geometry, publish, rootOffsetSV])

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current !== null || geometry.pausedRef.current) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      measure()
    })
  }, [geometry, measure])

  useEffect(() => {
    if (!geometry.pausedRef.current) measure()
  })

  useEffect(() => geometry.subscribe((event) => {
    if (event === 'measure') measure()
    else publish()
  }), [geometry, measure, publish])

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
  }, [])

  return { sortable, bodyRef, cardRef, scheduleMeasure }
}
