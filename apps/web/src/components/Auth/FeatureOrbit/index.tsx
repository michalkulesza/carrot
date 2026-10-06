import FeatureCaption from './FeatureCaption'
import { FEATURES } from './features'
import { DESKTOP_QUERY, useMediaQuery } from './useMediaQuery'
import { useFeatureOrbit } from './useFeatureOrbit'

const CARD_CLASS =
  'absolute top-0 left-0 rounded-[20px] shadow-[0_18px_40px_rgba(31,29,43,.12)] will-change-transform select-none data-[active=true]:shadow-[0_30px_60px_rgba(31,29,43,.22)] data-[active=true]:ring-3 data-[active=true]:ring-carrot'

/**
 * Decorative orbit of feature demo cards plus its caption. It renders (and
 * animates) only on desktop widths, so mobile pays nothing for it.
 */
const FeatureOrbit = () => {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const { containerRef, setCardRef, activeIndex, jumpTo } = useFeatureOrbit(
    FEATURES.length,
    isDesktop
  )

  if (!isDesktop) return null

  return (
    <div ref={containerRef} className="absolute inset-0">
      <div aria-hidden="true" className="absolute inset-0">
        {FEATURES.map(({ key, Card }, index) => (
          <div key={key} ref={setCardRef(index)} className={CARD_CLASS}>
            <Card />
          </div>
        ))}
      </div>
      <FeatureCaption activeIndex={activeIndex} onSelect={jumpTo} />
    </div>
  )
}

export default FeatureOrbit
