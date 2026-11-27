import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { ScrollView } from 'react-native'

interface UseDragAutoScrollParams {
  scrollRef: RefObject<ScrollView | null>
  scrollYRef: RefObject<number>
  topClearance: number
  bottomClearance: number
}

const EDGE_SIZE = 72
const STEP = 8

export const useDragAutoScroll = ({ scrollRef, scrollYRef, topClearance, bottomClearance }: UseDragAutoScrollParams) => {
  const directionRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const viewportHeightRef = useRef(0)
  const contentHeightRef = useRef(0)

  const stop = useCallback(() => {
    directionRef.current = 0
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  const step = useCallback(() => {
    frameRef.current = null
    const direction = directionRef.current
    if (direction === 0) return

    const current = scrollYRef.current ?? 0
    const maxOffset = Math.max(0, contentHeightRef.current - viewportHeightRef.current)
    const next = Math.min(maxOffset, Math.max(0, current + direction * STEP))
    if (next === current) return

    scrollRef.current?.scrollTo({ y: next, animated: false })
    scrollYRef.current = next
    frameRef.current = requestAnimationFrame(step)
  }, [scrollRef, scrollYRef])

  const update = useCallback((hoverY: number) => {
    const topEdge = topClearance + EDGE_SIZE
    const bottomEdge = viewportHeightRef.current - bottomClearance - EDGE_SIZE
    const direction = hoverY < topEdge ? -1 : hoverY > bottomEdge ? 1 : 0

    directionRef.current = direction
    if (direction !== 0 && frameRef.current === null) frameRef.current = requestAnimationFrame(step)
  }, [topClearance, bottomClearance, step])

  const handleViewportLayout = useCallback((height: number) => { viewportHeightRef.current = height }, [])
  const handleContentSizeChange = useCallback((_width: number, height: number) => { contentHeightRef.current = height }, [])

  useEffect(() => stop, [stop])

  return { update, stop, handleViewportLayout, handleContentSizeChange }
}
