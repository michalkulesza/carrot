import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'react-feather'
import { useTranslation } from 'react-i18next'

interface HorizontalScrollStripProps {
  children: ReactNode
}

const SCROLL_STEP_RATIO = 0.6

const arrowClass =
  'absolute top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-white text-zinc-600 shadow border border-zinc-200 hover:bg-zinc-100 transition-colors'

// Horizontally scrollable row that also scrolls with a plain vertical mouse wheel
// and shows edge arrows while there is more content in that direction.
const HorizontalScrollStrip = ({ children }: HorizontalScrollStripProps) => {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // Native listener: React's onWheel is passive, so it can't preventDefault.
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      const maxScrollLeft = el.scrollWidth - el.clientWidth
      const atStart = el.scrollLeft <= 0 && event.deltaY < 0
      const atEnd = el.scrollLeft >= maxScrollLeft - 1 && event.deltaY > 0
      // Let the page scroll once the strip can't move further that way.
      if (maxScrollLeft <= 0 || atStart || atEnd) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }

    updateArrows()
    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('scroll', updateArrows, { passive: true })
    const resizeObserver = new ResizeObserver(updateArrows)
    resizeObserver.observe(el)

    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('scroll', updateArrows)
      resizeObserver.disconnect()
    }
  }, [updateArrows])

  const scrollByStep = (direction: 1 | -1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({
      left: direction * el.clientWidth * SCROLL_STEP_RATIO,
      behavior: 'smooth',
    })
  }

  return (
    <div className="relative md:flex-1 md:min-w-0">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByStep(-1)}
          className={`${arrowClass} left-0`}
          aria-label={t('recipes.scrollTagsLeft')}
        >
          <ChevronLeft size={14} aria-hidden={true} />
        </button>
      )}
      <div
        ref={scrollRef}
        className="flex items-center gap-2 overflow-x-auto scrollbar-hide"
      >
        {children}
      </div>
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByStep(1)}
          className={`${arrowClass} right-0`}
          aria-label={t('recipes.scrollTagsRight')}
        >
          <ChevronRight size={14} aria-hidden={true} />
        </button>
      )}
    </div>
  )
}

export default HorizontalScrollStrip
