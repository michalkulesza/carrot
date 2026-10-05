import { useEffect, useState, type RefObject } from 'react'

const PHOTO_VISIBLE_RATIO = 0.5

// True once most of the photo has scrolled out of the rail. Waiting for it to
// vanish entirely never fires when the rail only overflows by a little.
export const useRailPhotoHidden = (
  enabled: boolean,
  railRef: RefObject<HTMLElement | null>,
  photoRef: RefObject<HTMLElement | null>
): boolean => {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const photo = photoRef.current
    if (!enabled || !photo) return
    const observer = new IntersectionObserver(
      ([entry]) => setHidden(entry.intersectionRatio < PHOTO_VISIBLE_RATIO),
      { root: railRef.current, threshold: [0, PHOTO_VISIBLE_RATIO, 1] }
    )
    observer.observe(photo)

    return () => observer.disconnect()
  }, [enabled, railRef, photoRef])

  return hidden
}
