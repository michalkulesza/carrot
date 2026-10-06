import { useTranslation } from 'react-i18next'
import { useCycle } from '../../useCycle'
import FeatureCard from '../../FeatureCard'
import { ScaleIcon } from '../../Icons'

const CYCLE_MS = 2200
const AMOUNT_CLASS = 'inline-block min-w-13 font-extrabold text-orange-700'
const STEP_CLASS =
  'flex size-6.5 items-center justify-center font-extrabold text-carrot-strong'

// Literal demo data: serves, chicken, rice, garlic.
const SCALES = [
  { serves: '2', chicken: '⅔ lb', rice: '⅔ cup', garlic: '2' },
  { serves: '4', chicken: '1⅓ lb', rice: '1⅓ cups', garlic: '4' },
  { serves: '6', chicken: '2 lb', rice: '2 cups', garlic: '6' },
]

const ScalingCard = () => {
  const { t } = useTranslation()
  const { serves, chicken, rice, garlic } =
    SCALES[useCycle(SCALES.length, CYCLE_MS, SCALES.length - 1)]

  return (
    <FeatureCard
      label={t('auth.features.scaling.label')}
      icon={<ScaleIcon />}
      accentClassName="bg-carrot-tint text-orange-700"
    >
      <div className="flex items-center justify-between rounded-[10px] bg-canvas py-1 pr-1 pl-3">
        <span className="text-[13px] font-bold text-ink-muted">
          {t('auth.features.scaling.serves')}
        </span>
        <div className="flex items-center">
          <span className={STEP_CLASS}>−</span>
          <span className="w-6 text-center text-[15px] font-extrabold">
            {serves}
          </span>
          <span className={STEP_CLASS}>+</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span>
          <b className={AMOUNT_CLASS}>{chicken}</b>{' '}
          {t('auth.features.scaling.chicken')}
        </span>
        <span>
          <b className={AMOUNT_CLASS}>{rice}</b>{' '}
          {t('auth.features.scaling.rice')}
        </span>
        <span>
          <b className={AMOUNT_CLASS}>{garlic}</b>{' '}
          {t('auth.features.scaling.garlic')}
        </span>
      </div>
    </FeatureCard>
  )
}

export default ScalingCard
