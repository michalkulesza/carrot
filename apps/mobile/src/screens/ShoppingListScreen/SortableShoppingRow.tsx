import { memo, useCallback, type ComponentProps } from 'react'
import type { LayoutAnimationFunction } from 'react-native-reanimated'
import { SortableItem, type DraxRenderHoverContentProps, type SortableListHandle } from 'react-native-drax'
import type { ShoppingListItem } from '@carrot/shared/types'
import DragPreviewRow from './DragPreviewRow'
import { DRAG_SNAP_MS, LIFT_SCALE, rowStackStyle } from './motion'
import ShoppingItemRow from './ShoppingItemRow'

type SortableShoppingRowProps = ComponentProps<typeof ShoppingItemRow> & {
  sortable: SortableListHandle<ShoppingListItem>
  index: number
  draggable: boolean
  fixed: boolean
  reduceMotion: boolean
  moveLayout: LayoutAnimationFunction
  onSnapEnd: () => void
}

const LIFTED_HOVER_STYLE = { transform: [{ scale: LIFT_SCALE }] }

const SortableShoppingRow = ({ sortable, index, draggable, fixed, reduceMotion, moveLayout, onSnapEnd, ...rowProps }: SortableShoppingRowProps) => {
  const { text, phase } = rowProps

  const renderHoverContent = useCallback(
    ({ dimensions }: DraxRenderHoverContentProps) => (
      <DragPreviewRow text={text} width={dimensions?.width} height={dimensions?.height} />
    ),
    [text],
  )

  const hoverDraggingStyle = reduceMotion ? undefined : LIFTED_HOVER_STYLE
  const outerStyle = rowStackStyle(phase)
  const snapDuration = reduceMotion ? 0 : DRAG_SNAP_MS

  return (
    <SortableItem
      sortable={sortable}
      index={index}
      dragHandle
      draggable={draggable}
      fixed={fixed}
      outerLayout={moveLayout}
      outerStyle={outerStyle}
      renderHoverContent={renderHoverContent}
      hoverDraggingStyle={hoverDraggingStyle}
      snapDelay={0}
      snapDuration={snapDuration}
      onSnapEnd={onSnapEnd}
      // Clears Drax's adjustable "Item N of M" defaults so VoiceOver reaches the row's own checkbox and text controls.
      accessibilityLabel={undefined}
      accessibilityHint={undefined}
      accessibilityRole={undefined}
    >
      <ShoppingItemRow {...rowProps} />
    </SortableItem>
  )
}

// `sortable` is a new handle on every aisle render; SortableItem only needs the fresh one when its own index
// or item changes, so unchanged rows skip re-rendering (and Drax re-registration) while a move runs.
const areRowPropsEqual = (previous: SortableShoppingRowProps, next: SortableShoppingRowProps) => {
  const keys = Object.keys(next) as (keyof SortableShoppingRowProps)[]
  const sameProps = keys.length === Object.keys(previous).length
    && keys.every((key) => key === 'sortable' || previous[key] === next[key])
  return sameProps && previous.sortable.data[previous.index] === next.sortable.data[next.index]
}

export default memo(SortableShoppingRow, areRowPropsEqual)
