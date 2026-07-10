import { useCallback, useEffect, useState } from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import type { RecipeOut } from '@carrot/shared/types'
import { reorderRecipes } from '../../api/client'
import { applySortRows, type Sort, type SortField } from './helpers'

export const useSortableRecipes = (recipes: RecipeOut[]) => {
  const [sort, setSort] = useState<Sort>({ field: 'created_at', dir: 'desc' })
  const [localRows, setLocalRows] = useState<RecipeOut[]>(recipes)

  // Merge external recipe updates (edits, deletes, adds) without losing drag order
  useEffect(() => {
    setLocalRows((prev) => {
      const map = new Map(recipes.map((r) => [r.id, r]))
      const updated = prev
        .filter((r) => map.has(r.id))
        .map((r) => map.get(r.id)!)
      const prevIds = new Set(prev.map((r) => r.id))
      const added = recipes.filter((r) => !prevIds.has(r.id))

      return [...added, ...updated]
    })
  }, [recipes])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      // Drag operates on whatever is currently displayed (sorted or not)
      const source = sort ? applySortRows(localRows, sort) : localRows
      const oldIdx = source.findIndex((r) => r.id === active.id)
      const newIdx = source.findIndex((r) => r.id === over.id)
      const reordered = arrayMove(source, oldIdx, newIdx)

      setLocalRows(reordered)
      setSort(null) // dragging always clears column sort → manual mode
      reorderRecipes(reordered.map((r) => r.id)).catch(() => {})
    },
    [sort, localRows]
  )

  const toggleSort = useCallback((field: SortField) => {
    setSort((prev) => {
      if (prev?.field === field)
        return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }

      return { field, dir: field === 'created_at' ? 'desc' : 'asc' }
    })
  }, [])

  const displayed = sort ? applySortRows(localRows, sort) : localRows

  return { sort, displayed, sensors, handleDragEnd, toggleSort }
}
