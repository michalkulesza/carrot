import { createRef, memo, useCallback, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated'
import { SortableContainer, type SortableDragPositionChangeEvent } from 'react-native-drax'
import type { PresenceUser, ShoppingCategory, ShoppingListItem } from '@carrot/shared/types'
import AddItemRow from './AddItemRow'
import AisleHeaderRow from './AisleHeaderRow'
import { isHeightPhase, type RowPhase, type ShoppingAisle } from './helpers'
import SortableShoppingRow from './SortableShoppingRow'
import { styles } from './styles'
import { useAisleSortable } from './useAisleSortable'
import type { DragGeometry } from './useDragGeometry'
import { useMoveTransition } from './useMoveTransition'

export interface AisleCardHandlers {
  isFresh: (id: string) => boolean
  onToggleAisle: (category: ShoppingCategory) => void
  onReorder: (category: ShoppingCategory, items: ShoppingListItem[]) => void
  onPositionChange: (event: SortableDragPositionChangeEvent<ShoppingListItem>) => void
  onSnapEnd: () => void
  onToggleItem: (id: string) => void
  onDelete: (id: string) => void
  onEditStart: (id: string) => void
  onEditEnd: (id: string, initialText: string, nextText: string) => void
  onOpenAdd: (category: ShoppingCategory) => void
  onCloseAdd: (category: ShoppingCategory) => void
  onAdd: (category: ShoppingCategory, text: string) => void
}

interface AisleCardProps {
  aisle: ShoppingAisle
  progress: SharedValue<number>
  dropSpace: SharedValue<number>
  phases: ReadonlyMap<string, RowPhase>
  lockByItem: ReadonlyMap<string, PresenceUser>
  editingId: string | null
  addOpen: boolean
  sliding: boolean
  instant: boolean
  reduceMotion: boolean
  boardMoveBlocked: SharedValue<boolean>
  geometry: DragGeometry
  handlers: AisleCardHandlers
}

// Page auto-scroll is owned by the screen; a null ref keeps each column's own auto-scroll inert.
const NO_SCROLL_REF = createRef<null>()

const AisleCard = ({
  aisle,
  progress,
  dropSpace,
  phases,
  lockByItem,
  editingId,
  addOpen,
  sliding,
  instant,
  reduceMotion,
  boardMoveBlocked,
  geometry,
  handlers,
}: AisleCardProps) => {
  const { category, items, ticked, collapsed } = aisle
  const bodyHeight = useSharedValue(0)
  const rows = useMemo(() => [...items, ...ticked], [items, ticked])
  const tickedIds = useMemo(() => new Set(ticked.map((item) => item.id)), [ticked])
  const phaseValues = useMemo(() => [...phases.values()], [phases])
  const moveBlocked = instant || sliding || editingId !== null || phaseValues.some(isHeightPhase)
  const { moveLayout, handleAdd } = useMoveTransition({
    blocked: moveBlocked,
    boardBlocked: boardMoveBlocked,
    rows,
    onAdd: handlers.onAdd,
  })
  const { sortable, bodyRef, cardRef, scheduleMeasure } = useAisleSortable({
    category,
    items,
    rows,
    collapsed,
    reduceMotion,
    geometry,
    onReorder: handlers.onReorder,
    onPositionChange: handlers.onPositionChange,
  })

  useLayoutEffect(() => {
    dropSpace.value = 0
  }, [items, dropSpace])

  // Fully open, the body stays in flow so row add/remove animations size the card naturally.
  // Otherwise it is lifted out of flow: Yoga mis-sizes in-flow children of a near-zero-height parent.
  const clipStyle = useAnimatedStyle(() => ({
    height: progress.value === 0 ? 'auto' : bodyHeight.value * (1 - progress.value),
  }), [progress, bodyHeight])

  const slideStyle = useAnimatedStyle(() => ({
    position: progress.value === 0 ? 'relative' : 'absolute',
    transform: [{ translateY: -bodyHeight.value * progress.value }],
  }), [progress, bodyHeight])

  const dropSpaceStyle = useAnimatedStyle(() => ({
    height: Math.max(0, dropSpace.value),
    marginTop: Math.min(0, dropSpace.value),
  }), [dropSpace])

  const clipStyles = useMemo(() => [styles.clip, clipStyle], [clipStyle])
  const bodyStyles = useMemo(() => [styles.body, slideStyle], [slideStyle])
  const bodyPointerEvents = collapsed ? 'none' : 'auto'
  const bodyImportance = collapsed ? 'no-hide-descendants' : 'auto'

  const handleBodyLayout = useCallback((event: LayoutChangeEvent) => {
    bodyHeight.value = event.nativeEvent.layout.height
    scheduleMeasure()
  }, [bodyHeight, scheduleMeasure])

  const rowPropsOf = (item: ShoppingListItem) => {
    const lock = lockByItem.get(item.id)
    return {
      id: item.id,
      text: item.text,
      completed: item.completed,
      phase: phases.get(item.id) ?? 'idle',
      fresh: handlers.isFresh(item.id),
      editing: editingId === item.id,
      lockName: lock?.nickname,
      lockColor: lock?.color,
      onToggle: handlers.onToggleItem,
      onDelete: handlers.onDelete,
      onEditStart: handlers.onEditStart,
      onEditEnd: handlers.onEditEnd,
    }
  }

  const dropSpaceView = <Animated.View key="drop-space" style={dropSpaceStyle} />

  const renderedRows: ReactNode[] = []
  let dropSpaceRendered = false
  sortable.data.forEach((item, index) => {
    const rowProps = rowPropsOf(item)
    const fixed = tickedIds.has(item.id)
    if (fixed && !dropSpaceRendered) {
      renderedRows.push(dropSpaceView)
      dropSpaceRendered = true
    }

    const draggable = !item.completed && !rowProps.editing && rowProps.lockName === undefined
    renderedRows.push(
      <SortableShoppingRow
        key={item.id}
        {...rowProps}
        sortable={sortable}
        index={index}
        draggable={draggable && !fixed}
        fixed={fixed}
        reduceMotion={reduceMotion}
        moveLayout={moveLayout}
        onSnapEnd={handlers.onSnapEnd}
      />,
    )
  })
  if (!dropSpaceRendered) renderedRows.push(dropSpaceView)

  return (
    <View ref={cardRef} style={styles.card} onLayout={scheduleMeasure} collapsable={false}>
      <AisleHeaderRow
        category={category}
        left={aisle.left}
        total={aisle.total}
        collapsed={collapsed}
        progress={progress}
        onToggle={handlers.onToggleAisle}
      />
      <Animated.View
        style={clipStyles}
        pointerEvents={bodyPointerEvents}
        accessibilityElementsHidden={collapsed}
        importantForAccessibility={bodyImportance}
      >
        <Animated.View ref={bodyRef} style={bodyStyles} onLayout={handleBodyLayout} collapsable={false}>
          <SortableContainer sortable={sortable} scrollRef={NO_SCROLL_REF}>
            {renderedRows}
            <AddItemRow
              category={category}
              open={addOpen}
              onOpen={handlers.onOpenAdd}
              onClose={handlers.onCloseAdd}
              onAdd={handleAdd}
            />
          </SortableContainer>
        </Animated.View>
      </Animated.View>
    </View>
  )
}

export default memo(AisleCard)
