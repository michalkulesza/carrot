import { useTranslation } from 'react-i18next'
import FeatureCard from '../../FeatureCard'
import { WarningIcon } from '../../Icons'

const WARNING_CHIP = 'bg-amber-100 text-amber-800'
const SAFE_CHIP = 'bg-green-100 text-green-700'
const CHIP_CLASS =
  'rounded-full px-[9px] py-1 text-xs font-extrabold whitespace-nowrap'

const AllergensCard = () => {
  const { t } = useTranslation()

  return (
    <FeatureCard
      label={t('auth.features.allergens.label')}
      icon={<WarningIcon />}
      accentClassName="bg-amber-100 text-amber-800"
    >
      <span className="text-[15px] leading-tight font-extrabold">
        {t('auth.features.allergens.recipe')}
      </span>
      <div className="flex flex-wrap gap-[5px]">
        <span className={`${CHIP_CLASS} ${WARNING_CHIP}`}>
          ⚠ {t('auth.features.allergens.dairy')}
        </span>
        <span className={`${CHIP_CLASS} ${WARNING_CHIP}`}>
          ⚠ {t('auth.features.allergens.nuts')}
        </span>
        <span className={`${CHIP_CLASS} ${SAFE_CHIP}`}>
          ✓ {t('auth.features.allergens.glutenFree')}
        </span>
      </div>
      <div className="flex items-center gap-2 pt-0.5 text-[13px]">
        <span className="size-[7px] rounded-full bg-amber-400" />
        <span>
          <b>¾ cup</b> {t('auth.features.allergens.ingredient')}
        </span>
        <span className="ml-auto font-bold text-amber-800">
          {t('auth.features.allergens.flags')}
        </span>
      </div>
    </FeatureCard>
  )
}

export default AllergensCard
