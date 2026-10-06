import { useTranslation } from 'react-i18next'
import { useCycle } from '../../useCycle'
import FeatureCard from '../../FeatureCard'
import { UnitsIcon } from '../../Icons'

const CYCLE_MS = 2600
const AMOUNT_CLASS = 'inline-block min-w-15 font-extrabold text-cyan-800'
const SEGMENT_CLASS =
  'flex-1 rounded-lg p-[5px] text-center text-[13px] font-extrabold transition-all duration-300'
const SEGMENT_ON = 'bg-white text-ink shadow-[0_1px_3px_rgba(31,29,43,.12)]'
const SEGMENT_OFF = 'text-ink-subtle'

// Literal demo data: chicken, broth, oil.
const SYSTEMS = [
  { id: 'metric', chicken: '900 g', broth: '950 ml', oil: '30 ml' },
  { id: 'us', chicken: '2 lb', broth: '4 cups', oil: '2 tbsp' },
]

const UnitsCard = () => {
  const { t } = useTranslation()
  const system = SYSTEMS[useCycle(SYSTEMS.length, CYCLE_MS)]
  const isMetric = system.id === 'metric'

  return (
    <FeatureCard
      label={t('auth.features.units.label')}
      icon={<UnitsIcon />}
      accentClassName="bg-cyan-100 text-cyan-800"
    >
      <div className="flex rounded-[10px] bg-mist p-0.75">
        <span
          className={`${SEGMENT_CLASS} ${isMetric ? SEGMENT_ON : SEGMENT_OFF}`}
        >
          {t('auth.features.units.metric')}
        </span>
        <span
          className={`${SEGMENT_CLASS} ${isMetric ? SEGMENT_OFF : SEGMENT_ON}`}
        >
          {t('auth.features.units.us')}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span>
          <b className={AMOUNT_CLASS}>{system.chicken}</b>{' '}
          {t('auth.features.units.chicken')}
        </span>
        <span>
          <b className={AMOUNT_CLASS}>{system.broth}</b>{' '}
          {t('auth.features.units.broth')}
        </span>
        <span>
          <b className={AMOUNT_CLASS}>{system.oil}</b>{' '}
          {t('auth.features.units.oil')}
        </span>
      </div>
    </FeatureCard>
  )
}

export default UnitsCard
