import { useCallback, useRef, useState } from 'react'

export interface ItemSheetTarget {
  ci: number
  ii: number
  isNew: boolean
}

interface UseItemSheetTargetArgs {
  getCount: (ci: number) => number
  isEmpty: (ci: number, ii: number) => boolean
  add: (ci: number) => void
  remove: (ci: number, ii: number) => void
}

export const useItemSheetTarget = ({ getCount, isEmpty, add, remove }: UseItemSheetTargetArgs) => {
  const [target, setTarget] = useState<ItemSheetTarget | null>(null)
  const targetRef = useRef<ItemSheetTarget | null>(null)

  const present = useCallback((next: ItemSheetTarget) => {
    targetRef.current = next
    setTarget(next)
  }, [])

  const clear = useCallback(() => {
    targetRef.current = null
    setTarget(null)
  }, [])

  const open = useCallback(
    (ci: number, ii: number) => {
      if (targetRef.current) return
      present({ ci, ii, isNew: false })
    },
    [present],
  )

  const addAndOpen = useCallback(
    (ci: number) => {
      if (targetRef.current) return
      const ii = getCount(ci)
      add(ci)
      present({ ci, ii, isNew: true })
    },
    [getCount, add, present],
  )

  const handleDismiss = useCallback(() => {
    const dismissed = targetRef.current
    clear()
    if (dismissed?.isNew && isEmpty(dismissed.ci, dismissed.ii)) remove(dismissed.ci, dismissed.ii)
  }, [clear, isEmpty, remove])

  const handleRemove = useCallback(() => {
    const removed = targetRef.current
    if (!removed) return
    clear()
    remove(removed.ci, removed.ii)
  }, [clear, remove])

  return { target, open, addAndOpen, handleDismiss, handleRemove }
}
