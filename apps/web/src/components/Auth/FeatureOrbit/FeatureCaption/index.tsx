import { useTranslation } from 'react-i18next'
import { FEATURES } from '../features'

interface FeatureCaptionProps {
  activeIndex: number
  onSelect: (index: number) => void
}

const FeatureCaption = ({ activeIndex, onSelect }: FeatureCaptionProps) => {
  const { t } = useTranslation()
  const active = FEATURES[activeIndex]
  const total = String(FEATURES.length).padStart(2, '0')
  const position = String(activeIndex + 1).padStart(2, '0')

  return (
    <div className="absolute bottom-9 left-9 z-40 flex w-50 flex-col items-start gap-3 text-left">
      <div className="flex flex-col items-start gap-1.5">
        <span className="text-xs font-extrabold tracking-[.08em] text-carrot-strong">
          {position} / {total}
        </span>
        <span className="text-2xl leading-[1.15] font-extrabold text-ink">
          {t(`${active.translationPrefix}.title`)}
        </span>
        <span className="min-h-11 text-[15px] leading-[1.45] font-semibold text-pretty text-ink-muted">
          {t(`${active.translationPrefix}.description`)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {FEATURES.map(({ key }, index) => {
          const isActive = index === activeIndex

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(index)}
              aria-label={t('auth.features.dotLabel', { index: index + 1 })}
              aria-current={isActive ? 'true' : undefined}
              className={`h-2 cursor-pointer rounded-full transition-all duration-300 ${
                isActive ? 'w-6 bg-carrot' : 'w-2 bg-line-strong'
              }`}
            />
          )
        })}
      </div>
    </div>
  )
}

export default FeatureCaption
