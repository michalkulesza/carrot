import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useSharedValue, type SharedValue } from 'react-native-reanimated'
import type { ShoppingCategory, ShoppingListItem } from '@carrot/shared/types'
import { ADD_MOVE_HOLD_MS, createMoveTransition } from './motion'

interface AddHold {
  ids: ReadonlySet<string>
  timer: ReturnType<typeof setTimeout>
}

interface UseMoveTransitionParams {
  blocked: boolean
  boardBlocked: SharedValue<boolean>
  rows: ShoppingListItem[]
  onAdd: (category: ShoppingCategory, text: string) => void
}

// One stable layout transition per aisle, armed at rest. Blockers are shared values, so arming and
// disarming never re-render the rows.
export const useMoveTransition = ({ blocked, boardBlocked, rows, onAdd }: UseMoveTransitionParams) => {
  const restBlocked = useSharedValue(blocked)
  const addBlocked = useSharedValue(false)
  const addHoldRef = useRef<AddHold | null>(null)
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const moveLayout = useMemo(
    () => createMoveTransition([restBlocked, addBlocked, boardBlocked]),
    [restBlocked, addBlocked, boardBlocked],
  )

  useLayoutEffect(() => {
    restBlocked.value = blocked
  }, [blocked, restBlocked])

  const releaseAddHold = useCallback(() => {
    if (addHoldRef.current) clearTimeout(addHoldRef.current.timer)
    addHoldRef.current = null
    addBlocked.value = false
  }, [addBlocked])

  // The new row's insert must not slide the rows below it; release once that commit has been mounted.
  useEffect(() => {
    const hold = addHoldRef.current
    if (!hold || rows.every((item) => hold.ids.has(item.id))) return

    const frame = requestAnimationFrame(releaseAddHold)
    return () => cancelAnimationFrame(frame)
  }, [rows, releaseAddHold])

  useEffect(() => () => {
    if (addHoldRef.current) clearTimeout(addHoldRef.current.timer)
  }, [])

  const handleAdd = useCallback((category: ShoppingCategory, text: string) => {
    if (addHoldRef.current) clearTimeout(addHoldRef.current.timer)
    addHoldRef.current = {
      ids: new Set(rowsRef.current.map((item) => item.id)),
      timer: setTimeout(releaseAddHold, ADD_MOVE_HOLD_MS),
    }
    addBlocked.value = true
    onAdd(category, text)
  }, [addBlocked, onAdd, releaseAddHold])

  return { moveLayout, handleAdd }
}
