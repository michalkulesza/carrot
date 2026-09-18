import { useRef, useState, type ReactNode } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import type { Location } from 'react-router-dom'

gsap.registerPlugin(useGSAP)

interface PageTransitionProps {
  location: Location
  children: (displayLocation: Location) => ReactNode
}

const PageTransition = ({ location, children }: PageTransitionProps) => {
  const contentRef = useRef<HTMLDivElement>(null)
  const previousPathnameRef = useRef(location.pathname)
  const [displayLocation, setDisplayLocation] = useState(location)

  useGSAP(
    () => {
      const content = contentRef.current
      if (!content || previousPathnameRef.current === location.pathname) return

      previousPathnameRef.current = location.pathname

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setDisplayLocation(location)

        return
      }

      gsap
        .timeline({ defaults: { overwrite: 'auto' } })
        .to(content, { autoAlpha: 0, y: -8, duration: 0.12 })
        .add(() => setDisplayLocation(location))
        .fromTo(
          content,
          { autoAlpha: 0, y: 12 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.2,
            ease: 'power2.out',
            immediateRender: false,
          }
        )
    },
    {
      dependencies: [location.pathname],
      scope: contentRef,
      revertOnUpdate: true,
    }
  )

  return <div ref={contentRef}>{children(displayLocation)}</div>
}

export default PageTransition
