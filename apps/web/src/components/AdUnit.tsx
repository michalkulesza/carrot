import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

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

const AdUnit = ({ slot, format = 'rectangle', style }: AdUnitProps) => {
  const { t } = useTranslation()
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
    <div className="flex flex-col items-center gap-1" style={style}>
      <span className="text-[10px] uppercase tracking-[0.05em] text-gray-400">
        {t('ads.advertisement')}
      </span>
      <div className="relative h-[250px] w-[300px]">
        {/* Shows through until AdSense fills the ins tag on top of it */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border border-gray-300 bg-gray-50 text-sm text-gray-400">
          {t('ads.placeholder')}
        </div>
        <ins
          ref={ref}
          className="adsbygoogle relative block h-[250px] w-[300px]"
          data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
          data-ad-slot={slot}
          data-ad-format={format}
        />
      </div>
    </div>
  )
}

export default AdUnit
