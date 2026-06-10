import { useEffect, useRef } from 'react'

interface AdUnitProps {
  slot: string
  format?: 'auto' | 'rectangle'
  style?: React.CSSProperties
}

declare global {
  interface Window {
    adsbygoogle: unknown[]
  }
}

export default function AdUnit({
  slot,
  format = 'rectangle',
  style,
}: AdUnitProps) {
  const ref = useRef<HTMLModElement>(null)
  const pushed = useRef(false)

  useEffect(() => {
    if (pushed.current) return
    pushed.current = true
    try {
      ;(window.adsbygoogle = window.adsbygoogle ?? []).push({})
    } catch {
      // AdSense not loaded yet (dev mode without script)
    }
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: '#aaa',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        Advertisement
      </span>
      <div style={{ position: 'relative', width: 300, height: 250 }}>
        {/* Placeholder visible in dev / before AdSense fills */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: '1px solid #d1d5db',
            borderRadius: 6,
            background: '#f9fafb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: 13,
            pointerEvents: 'none',
          }}
        >
          Ad
        </div>
        <ins
          ref={ref}
          className="adsbygoogle"
          style={{
            display: 'block',
            width: 300,
            height: 250,
            position: 'relative',
          }}
          data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
          data-ad-slot={slot}
          data-ad-format={format}
        />
      </div>
    </div>
  )
}
