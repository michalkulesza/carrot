import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

type Role = 'title' | 'tags'

export type MarqueeTurn = {
  turn: number | null
  onOverflowChange: (overflows: boolean) => void
  onDone: () => void
}

type MarqueeSyncContextValue = {
  phase: Role
  token: number
  reportOverflow: (id: string, role: Role, overflows: boolean) => void
  reportDone: (id: string, role: Role) => void
  unregister: (id: string, role: Role) => void
}

const MarqueeSyncContext = createContext<MarqueeSyncContextValue | null>(null)

// Coordinates every title/tag marquee across an entire list into two
// synchronized rounds: first every overflowing title scrolls out and back
// together, then every overflowing tag row does, then back to titles, and so
// on — instead of each one running on its own independent clock.
//
// All bookkeeping (which ids currently overflow, which ones are still mid-
// round) lives in refs rather than state, so it's read via `phaseRef` inside
// callbacks instead of a closed-over value that could be stale by the time a
// distant list item's effect fires. Only `phase`/`token` are real state,
// since those are the only values that need to trigger a re-render.
export const MarqueeSyncProvider = ({ children }: { children: ReactNode }) => {
  const [phase, setPhase] = useState<Role>('title')
  const [token, setToken] = useState(0)
  const phaseRef = useRef<Role>('title')
  phaseRef.current = phase

  const overflowing = useRef<{ title: Set<string>; tags: Set<string> }>({ title: new Set(), tags: new Set() })
  const remaining = useRef<Set<string>>(new Set())

  const advance = useCallback(() => {
    setPhase((prev) => {
      const next: Role = prev === 'title' ? 'tags' : 'title'
      remaining.current = new Set(overflowing.current[next])
      return next
    })
    setToken((t) => t + 1)
  }, [])

  // If the round that just emptied out leaves nothing to animate, but the
  // other role has overflowing content, hop straight to it instead of
  // sitting idle until something changes.
  const maybeAdvance = useCallback(() => {
    if (remaining.current.size > 0) return
    const otherRole: Role = phaseRef.current === 'title' ? 'tags' : 'title'
    if (overflowing.current[otherRole].size > 0) advance()
  }, [advance])

  const reportOverflow = useCallback(
    (id: string, role: Role, overflows: boolean) => {
      const set = overflowing.current[role]
      if (overflows) set.add(id)
      else set.delete(id)

      if (role === phaseRef.current) {
        if (overflows) remaining.current.add(id)
        else {
          remaining.current.delete(id)
          maybeAdvance()
        }
      }
    },
    [maybeAdvance],
  )

  const reportDone = useCallback(
    (id: string, role: Role) => {
      if (role !== phaseRef.current) return
      remaining.current.delete(id)
      maybeAdvance()
    },
    [maybeAdvance],
  )

  const unregister = useCallback(
    (id: string, role: Role) => {
      overflowing.current[role].delete(id)
      if (role === phaseRef.current) {
        remaining.current.delete(id)
        maybeAdvance()
      }
    },
    [maybeAdvance],
  )

  const value = useMemo(
    () => ({ phase, token, reportOverflow, reportDone, unregister }),
    [phase, token, reportOverflow, reportDone, unregister],
  )

  return <MarqueeSyncContext.Provider value={value}>{children}</MarqueeSyncContext.Provider>
}

let nextMarqueeId = 0

const useMarqueeSync = (role: Role): MarqueeTurn => {
  const ctx = useContext(MarqueeSyncContext)
  if (!ctx) throw new Error('useMarqueeSync must be used within a MarqueeSyncProvider')
  const idRef = useRef<string>()
  if (!idRef.current) idRef.current = `marquee-${nextMarqueeId++}`
  const id = idRef.current

  const { phase, token, reportOverflow, reportDone, unregister } = ctx

  useEffect(() => {
    return () => unregister(id, role)
  }, [id, role, unregister])

  const turn = phase === role ? token : null
  const onOverflowChange = useCallback((overflows: boolean) => reportOverflow(id, role, overflows), [id, role, reportOverflow])
  const onDone = useCallback(() => reportDone(id, role), [id, role, reportDone])

  return { turn, onOverflowChange, onDone }
}

type SlotsProps = {
  children: (slots: { title: MarqueeTurn; tags: MarqueeTurn }) => ReactNode
}

// Convenience wrapper so a single JSX-instantiated component (giving it a
// stable per-row identity, e.g. inside a FlatList renderItem) can grab both
// roles' turn state at once.
export const MarqueeSyncSlots = ({ children }: SlotsProps) => {
  const title = useMarqueeSync('title')
  const tags = useMarqueeSync('tags')
  return <>{children({ title, tags })}</>
}
