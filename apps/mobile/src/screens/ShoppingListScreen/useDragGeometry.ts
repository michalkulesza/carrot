import { useCallback, useMemo, useRef } from 'react'
import type { RefObject } from 'react'

export type GeometryEvent = 'measure' | 'scroll'

type GeometryListener = (event: GeometryEvent) => void

export interface DragGeometry {
  subscribe: (listener: GeometryListener) => () => void
  scrollYRef: RefObject<number>
  pausedRef: RefObject<boolean>
}

export const useDragGeometry = () => {
  const listenersRef = useRef(new Set<GeometryListener>())
  const scrollYRef = useRef(0)
  const pausedRef = useRef(false)

  const subscribe = useCallback((listener: GeometryListener) => {
    listenersRef.current.add(listener)
    return () => { listenersRef.current.delete(listener) }
  }, [])

  const emit = useCallback((event: GeometryEvent) => {
    listenersRef.current.forEach((listener) => listener(event))
  }, [])

  const geometry = useMemo<DragGeometry>(() => ({ subscribe, scrollYRef, pausedRef }), [subscribe])

  return { geometry, emit }
}
