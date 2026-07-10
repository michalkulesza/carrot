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

// Overflow bookkeeping lives in refs (read via phaseRef) so callbacks always see the latest state, not a stale closure from when a distant list item's effect fired.
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

  // If the round that just emptied leaves nothing to animate but the other role has overflowing content, hop straight to it instead of sitting idle.
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

// Lets a single JSX-instantiated component (e.g. inside a FlatList renderItem, for stable per-row identity) grab both roles' turn state at once.
export const MarqueeSyncSlots = ({ children }: SlotsProps) => {
  const title = useMarqueeSync('title')
  const tags = useMarqueeSync('tags')
  return <>{children({ title, tags })}</>
}
