import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { ShoppingListItem } from '@carrot/shared/types'
import {
  withMapEntry,
  withSetMember,
  type RowPhase,
  type RowStay,
} from './helpers'
import { COLLAPSE_MS, COMPLETED_GRACE_MS, EXPAND_MS, MOVE_MS } from './motion'

interface TickState {
  stay: ReadonlyMap<string, RowStay>
  grace: ReadonlySet<string>
  phases: ReadonlyMap<string, RowPhase>
}

interface UseTickSequenceParams {
  items: ShoppingListItem[]
  showCompleted: boolean
  instant: boolean
  dragActiveRef: MutableRefObject<boolean>
  editingIdRef: MutableRefObject<string | null>
}

interface DeferredStep {
  id: string
  step: () => void
}

interface RemoteFlip {
  id: string
  collapse: boolean
  held: boolean
}

const INITIAL_STATE: TickState = { stay: new Map(), grace: new Set(), phases: new Map() }
const LOCAL_FLIP_WINDOW_MS = 3000

export const useTickSequence = ({ items, showCompleted, instant, dragActiveRef, editingIdRef }: UseTickSequenceParams) => {
  const [state, setState] = useState(INITIAL_STATE)
  const [seenItems, setSeenItems] = useState(items)
  const [seenShowCompleted, setSeenShowCompleted] = useState(showCompleted)
  const stateRef = useRef(state)
  const timersRef = useRef(new Map<string, Set<ReturnType<typeof setTimeout>>>())
  const deferredRef = useRef<DeferredStep[]>([])
  const editDeferredRef = useRef<DeferredStep[]>([])
  const localFlipsRef = useRef(new Map<string, number>())
  const remoteFlipsRef = useRef<RemoteFlip[]>([])
  const heldOnHideRef = useRef<string[]>([])
  const showCompletedRef = useRef(showCompleted)
  const instantRef = useRef(instant)

  showCompletedRef.current = showCompleted
  instantRef.current = instant

  // Remote flips are derived during render so the reorder and the phase/pin land in one commit; an
  // intermediate commit would let a pinned row vanish and reappear under the armed move transition.
  // While loading, `items` is a fresh empty array every render; comparing it would re-render forever.
  const itemsChanged = seenItems !== items && (seenItems.length > 0 || items.length > 0)
  if (itemsChanged) {
    setSeenItems(items)

    const previous = new Map(seenItems.map((item) => [item.id, item]))
    const now = Date.now()
    let next = stateRef.current
    for (const item of instantRef.current ? [] : items) {
      const before = previous.get(item.id)
      if (!before || before.completed === item.completed) continue
      if (now - (localFlipsRef.current.get(item.id) ?? 0) < LOCAL_FLIP_WINDOW_MS) continue

      const held = item.completed && !showCompletedRef.current && editingIdRef.current === item.id
      const collapse = item.completed && !showCompletedRef.current && !held
      const stay = collapse ? { group: 'item' as const, position: before.position } : null
      next = {
        stay: withMapEntry(next.stay, item.id, stay),
        grace: withSetMember(next.grace, item.id, held),
        phases: withMapEntry(next.phases, item.id, collapse ? 'collapsing' : 'moving'),
      }
      remoteFlipsRef.current.push({ id: item.id, collapse, held })
    }

    if (next !== stateRef.current) {
      stateRef.current = next
      setState(next)
    }
  }

  // Hiding completed rows must not unmount a ticked row that is being edited; hold it in grace until the edit ends.
  if (seenShowCompleted !== showCompleted) {
    setSeenShowCompleted(showCompleted)

    const editingId = editingIdRef.current
    const editedItem = editingId ? items.find((item) => item.id === editingId) : undefined
    if (!showCompleted && editingId && editedItem?.completed && !stateRef.current.grace.has(editingId)) {
      stateRef.current = { ...stateRef.current, grace: withSetMember(stateRef.current.grace, editingId, true) }
      setState(stateRef.current)
      heldOnHideRef.current.push(editingId)
    }
  }

  const update = useCallback((patch: (current: TickState) => TickState) => {
    stateRef.current = patch(stateRef.current)
    setState(stateRef.current)
  }, [])

  const setGrace = useCallback((id: string, present: boolean) => {
    update((current) => ({ ...current, grace: withSetMember(current.grace, id, present) }))
  }, [update])

  const setPhase = useCallback((id: string, phase: RowPhase | null) => {
    update((current) => ({ ...current, phases: withMapEntry(current.phases, id, phase) }))
  }, [update])

  const cancel = useCallback((id: string) => {
    timersRef.current.get(id)?.forEach(clearTimeout)
    timersRef.current.delete(id)
    deferredRef.current = deferredRef.current.filter((entry) => entry.id !== id)
    editDeferredRef.current = editDeferredRef.current.filter((entry) => entry.id !== id)
  }, [])

  const schedule = useCallback((id: string, delay: number, step: () => void) => {
    const timers = timersRef.current.get(id) ?? new Set<ReturnType<typeof setTimeout>>()
    timersRef.current.set(id, timers)

    const timer = setTimeout(() => {
      timers.delete(timer)
      if (dragActiveRef.current) deferredRef.current.push({ id, step })
      else step()
    }, delay)
    timers.add(timer)
  }, [dragActiveRef])

  const resume = useCallback(() => {
    const pending = deferredRef.current
    deferredRef.current = []
    pending.forEach(({ step }) => step())
  }, [])

  // A ticked row stays editable, so removing it mid-edit would unmount the editor and drop the typed text.
  const runUnlessEditing = useCallback((id: string, step: () => void) => {
    if (editingIdRef.current === id) editDeferredRef.current.push({ id, step })
    else step()
  }, [editingIdRef])

  const resumeEdited = useCallback((id: string) => {
    const pending = editDeferredRef.current.filter((entry) => entry.id === id)
    editDeferredRef.current = editDeferredRef.current.filter((entry) => entry.id !== id)
    pending.forEach(({ step }) => step())
  }, [])

  const settleAfter = useCallback((id: string, delay: number) => {
    schedule(id, delay, () => setPhase(id, null))
  }, [schedule, setPhase])

  const expireGrace = useCallback((id: string) => {
    runUnlessEditing(id, () => {
      if (instantRef.current || showCompletedRef.current) {
        setGrace(id, false)
        return
      }

      setPhase(id, 'removing')
      schedule(id, COLLAPSE_MS, () => {
        setGrace(id, false)
        setPhase(id, null)
      })
    })
  }, [runUnlessEditing, schedule, setGrace, setPhase])

  // The cache flip from the same tap lands in this render, so the row starts sliding in this commit.
  const startTick = useCallback((item: ShoppingListItem) => {
    const { id } = item
    const phase = instantRef.current ? null : 'ticking'
    cancel(id)
    update((current) => ({
      stay: withMapEntry(current.stay, id, null),
      grace: withSetMember(current.grace, id, true),
      phases: withMapEntry(current.phases, id, phase),
    }))
    schedule(id, COMPLETED_GRACE_MS, () => expireGrace(id))
    if (!phase) return

    settleAfter(id, MOVE_MS)
  }, [cancel, expireGrace, schedule, settleAfter, update])

  const startUntick = useCallback((item: ShoppingListItem) => {
    const { id } = item
    const phase = instantRef.current ? null : 'moving'
    cancel(id)
    update((current) => ({
      stay: withMapEntry(current.stay, id, null),
      grace: withSetMember(current.grace, id, false),
      phases: withMapEntry(current.phases, id, phase),
    }))
    if (!phase) return

    settleAfter(id, MOVE_MS)
  }, [cancel, settleAfter, update])

  const markLocalFlip = useCallback((id: string) => {
    localFlipsRef.current.set(id, Date.now())
  }, [])

  const collapseRow = useCallback((id: string, onCollapsed: () => void) => {
    cancel(id)
    if (instantRef.current) {
      onCollapsed()
      return
    }

    setPhase(id, 'removing')
    schedule(id, COLLAPSE_MS, onCollapsed)
  }, [cancel, schedule, setPhase])

  const restoreRow = useCallback((id: string) => {
    cancel(id)
    setPhase(id, 'expanding')
    settleAfter(id, EXPAND_MS)
  }, [cancel, setPhase, settleAfter])

  const releaseRow = useCallback((id: string) => setPhase(id, null), [setPhase])

  const resetRow = useCallback((id: string) => {
    cancel(id)
    update((current) => ({
      stay: withMapEntry(current.stay, id, null),
      grace: withSetMember(current.grace, id, false),
      phases: withMapEntry(current.phases, id, null),
    }))
  }, [cancel, update])

  useLayoutEffect(() => {
    const held = heldOnHideRef.current
    heldOnHideRef.current = []
    held.forEach(expireGrace)
  }, [showCompleted, expireGrace])

  useLayoutEffect(() => {
    const flips = remoteFlipsRef.current
    remoteFlipsRef.current = []
    for (const { id, collapse, held } of flips) {
      cancel(id)
      if (!collapse) {
        settleAfter(id, MOVE_MS)
        if (held) expireGrace(id)
        continue
      }

      schedule(id, COLLAPSE_MS, () => {
        update((current) => ({
          ...current,
          stay: withMapEntry(current.stay, id, null),
          phases: withMapEntry(current.phases, id, null),
        }))
      })
    }
  }, [items, cancel, expireGrace, schedule, settleAfter, update])

  useEffect(() => () => {
    timersRef.current.forEach((timers) => timers.forEach(clearTimeout))
    timersRef.current.clear()
  }, [])

  const animating = state.phases.size > 0

  return useMemo(() => ({
    stay: state.stay,
    grace: state.grace,
    phases: state.phases,
    startTick,
    startUntick,
    markLocalFlip,
    collapseRow,
    restoreRow,
    releaseRow,
    resetRow,
    resume,
    resumeEdited,
    animating,
  }), [
    state,
    startTick,
    startUntick,
    markLocalFlip,
    collapseRow,
    restoreRow,
    releaseRow,
    resetRow,
    resume,
    resumeEdited,
    animating,
  ])
}
