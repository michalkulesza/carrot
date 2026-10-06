import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { REDUCED_MOTION_QUERY, useMediaQuery } from './useMediaQuery'

const DESIGN_WIDTH = 1200
const DESIGN_HEIGHT = 760
const MIN_SCALE = 0.75
const MAX_SCALE = 1.25
const ORBIT_RADIUS_X = 300
const ORBIT_RADIUS_Y = 250
const ORBIT_OFFSET_X = 100
const ORBIT_OFFSET_Y = -50
const AUTO_ADVANCE_MS = 3000
const HOVER_HOLD_MS = 1800
const FRAME_MS = 1000 / 60
const POSITION_EASING = 0.07
const CURSOR_EASING = 0.1
const MAX_FRAME_MS = 100

interface OrbitState {
  targetIndex: number
  position: number
  lastAdvanceAt: number
  lastFrameAt: number
  front: number
  isPointerInside: boolean
  pointerX: number
  pointerY: number
  smoothX: number
  smoothY: number
  width: number
  height: number
}

interface UseFeatureOrbitResult {
  containerRef: RefObject<HTMLDivElement | null>
  setCardRef: (index: number) => (element: HTMLDivElement | null) => void
  activeIndex: number
  jumpTo: (index: number) => void
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const wrap = (value: number, length: number) =>
  ((value % length) + length) % length

const createInitialState = (): OrbitState => ({
  targetIndex: 0,
  position: 0,
  lastAdvanceAt: 0,
  lastFrameAt: 0,
  front: -1,
  isPointerInside: false,
  pointerX: 0,
  pointerY: 0,
  smoothX: 0,
  smoothY: 0,
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
})

/** Eases towards a target at the same speed regardless of frame rate. */
const easingFactor = (perFrame: number, elapsedMs: number) =>
  1 - Math.pow(1 - perFrame, elapsedMs / FRAME_MS)

export const useFeatureOrbit = (
  count: number,
  isEnabled: boolean
): UseFeatureOrbitResult => {
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cardElements = useRef<(HTMLDivElement | null)[]>([])
  const stateRef = useRef<OrbitState>(createInitialState())
  const drawRef = useRef<(now: number) => void>(() => {})
  const [activeIndex, setActiveIndex] = useState(0)

  const setCardRef = useCallback(
    (index: number) => (element: HTMLDivElement | null) => {
      cardElements.current[index] = element
    },
    []
  )

  const jumpTo = useCallback(
    (index: number) => {
      const state = stateRef.current
      let delta = wrap(index - state.targetIndex, count)
      if (delta > count / 2) delta -= count

      state.targetIndex += delta
      state.lastAdvanceAt = performance.now()

      if (prefersReducedMotion) {
        state.position = state.targetIndex
        drawRef.current(performance.now())
      }
    },
    [count, prefersReducedMotion]
  )

  useEffect(() => {
    const container = containerRef.current
    const host = container?.parentElement
    if (!isEnabled || !container || !host) return

    const state = stateRef.current
    state.width = container.clientWidth || DESIGN_WIDTH
    state.height = container.clientHeight || DESIGN_HEIGHT

    const draw = (now: number) => {
      const elapsed = state.lastFrameAt
        ? clamp(now - state.lastFrameAt, 0, MAX_FRAME_MS)
        : FRAME_MS
      state.lastFrameAt = now
      if (!state.lastAdvanceAt) state.lastAdvanceAt = now

      if (!prefersReducedMotion) {
        if (state.isPointerInside) {
          state.lastAdvanceAt = Math.max(
            state.lastAdvanceAt,
            now - HOVER_HOLD_MS
          )
        } else if (now - state.lastAdvanceAt > AUTO_ADVANCE_MS) {
          state.targetIndex += 1
          state.lastAdvanceAt = now
        }

        state.position +=
          (state.targetIndex - state.position) *
          easingFactor(POSITION_EASING, elapsed)

        const wanderX = 0.6 * Math.sin(now * 0.0003)
        const wanderY = 0.5 * Math.sin(now * 0.00047 + 1)
        const cursorEasing = easingFactor(CURSOR_EASING, elapsed)
        const goalX = state.isPointerInside ? state.pointerX : wanderX
        const goalY = state.isPointerInside ? state.pointerY : wanderY
        state.smoothX += (goalX - state.smoothX) * cursorEasing
        state.smoothY += (goalY - state.smoothY) * cursorEasing
      }

      const { width, height, position } = state
      const scale = clamp(
        Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT),
        MIN_SCALE,
        MAX_SCALE
      )
      const centerX = width / 2 + ORBIT_OFFSET_X * scale
      const centerY = height / 2 + ORBIT_OFFSET_Y * scale
      const front = wrap(Math.round(position), count)

      const cards = cardElements.current
      const sizes = cards.map((card) => ({
        w: card?.offsetWidth ?? 0,
        h: card?.offsetHeight ?? 0,
      }))

      cards.forEach((card, index) => {
        if (!card || index >= count) return

        let offset = wrap(index - position, count)
        if (offset >= count / 2) offset -= count

        const angle = (offset / count) * Math.PI * 2
        const depth = (Math.cos(angle) + 1) / 2
        const parallax = (6 + depth * 16) * scale
        const x =
          centerX +
          Math.cos(angle) * ORBIT_RADIUS_X * scale +
          state.smoothX * parallax
        const y =
          centerY +
          Math.sin(angle) * ORBIT_RADIUS_Y * scale +
          state.smoothY * parallax
        const cardScale = (0.72 + 0.36 * Math.pow(depth, 1.6)) * scale
        const rotation = Math.sin(angle) * 6 + state.smoothX * 2
        const { w, h } = sizes[index]

        card.style.transform = `translate3d(${(x - w / 2).toFixed(1)}px,${(y - h / 2).toFixed(1)}px,0) scale(${cardScale.toFixed(3)}) rotate(${rotation.toFixed(2)}deg)`
        card.style.zIndex = String(Math.round(depth * 20))
        card.style.filter = `brightness(${(0.93 + depth * 0.07).toFixed(3)})`
        card.dataset.active = String(index === front)
      })

      if (front !== state.front) {
        state.front = front
        setActiveIndex(front)
      }
    }

    drawRef.current = draw

    const handlePointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      state.pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2
      state.pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2
      state.isPointerInside = true
    }
    const handlePointerLeave = () => {
      state.isPointerInside = false
    }

    const resizeObserver = new ResizeObserver(() => {
      state.width = container.clientWidth
      state.height = container.clientHeight
      if (prefersReducedMotion) draw(performance.now())
    })
    resizeObserver.observe(container)

    let frameId = 0
    const tick = (now: number) => {
      draw(now)
      frameId = requestAnimationFrame(tick)
    }

    if (prefersReducedMotion) {
      state.position = state.targetIndex
      draw(performance.now())
    } else {
      host.addEventListener('pointermove', handlePointerMove)
      host.addEventListener('pointerleave', handlePointerLeave)
      frameId = requestAnimationFrame(tick)
    }

    return () => {
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      host.removeEventListener('pointermove', handlePointerMove)
      host.removeEventListener('pointerleave', handlePointerLeave)
      state.isPointerInside = false
      state.lastFrameAt = 0
      drawRef.current = () => {}
    }
  }, [count, isEnabled, prefersReducedMotion])

  return { containerRef, setCardRef, activeIndex, jumpTo }
}
