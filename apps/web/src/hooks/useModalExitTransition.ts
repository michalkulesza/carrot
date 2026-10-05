import { useEffect, useRef } from 'react'
import { useAnimate, useReducedMotion } from 'framer-motion'

export const useModalExitTransition = (
  isPresent: boolean,
  onExitComplete: (() => void) | null | undefined
) => {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const reduceMotion = useReducedMotion()
  const wasClosing = useRef(false)

  useEffect(() => {
    const backdrop = scope.current
    const container = backdrop?.querySelector<HTMLElement>(
      '[data-slot="modal-container"]'
    )

    if (isPresent) {
      // Reopening during an exit must restore the interrupted popup.
      if (wasClosing.current && backdrop) {
        void animate(backdrop, { opacity: 1 }, { duration: 0 })
        if (container)
          void animate(container, { y: 0, scale: 1 }, { duration: 0 })
        if (!backdrop.contains(document.activeElement))
          backdrop.querySelector<HTMLElement>('[role="dialog"]')?.focus({
            preventScroll: true,
          })
      }
      wasClosing.current = false

      return
    }

    if (!backdrop) {
      onExitComplete?.()

      return
    }

    wasClosing.current = true
    const options = { duration: reduceMotion ? 0 : 0.18 }
    const animations = [animate(backdrop, { opacity: 0 }, options)]
    if (container)
      animations.push(
        animate(container, { y: [0, 12], scale: [1, 0.97] }, options)
      )
    let cancelled = false
    void Promise.all(animations).then(() => {
      if (!cancelled) onExitComplete?.()
    })

    return () => {
      cancelled = true
      animations.forEach((animation) => animation.stop())
    }
  }, [isPresent, onExitComplete, reduceMotion, scope, animate])

  return scope
}
