import { useTranslation } from 'react-i18next'
import FeatureCard from '../../FeatureCard'
import { CalendarIcon } from '../../Icons'

const DAY_CLASS = 'size-6.5 rounded-[7px]'
const EMPTY_DAY = `${DAY_CLASS} border-[1.5px] border-dashed border-line-strong`

const WEEK = [
  {
    id: 'mon',
    className: `${DAY_CLASS} bg-linear-to-br from-green-300 to-green-600`,
  },
  { id: 'tue', className: EMPTY_DAY },
  { id: 'wed', className: `${DAY_CLASS} bg-violet-100` },
  { id: 'thu', className: EMPTY_DAY },
  {
    id: 'fri',
    className: `${DAY_CLASS} bg-linear-to-br from-amber-200 to-amber-600`,
  },
  { id: 'sat', className: EMPTY_DAY },
  { id: 'sun', className: EMPTY_DAY },
]

const MealPlanCard = () => {
  const { t } = useTranslation()
  const initials = Array.from(t('auth.features.mealPlan.weekdayInitials'))

  return (
    <FeatureCard
      label={t('auth.features.mealPlan.label')}
      icon={<CalendarIcon />}
      accentClassName="bg-green-100 text-green-700"
    >
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map(({ id, className }, index) => (
          <div key={id} className="flex flex-col items-center gap-1">
            <span className="text-[11px] font-extrabold text-ink-subtle">
              {initials[index]}
            </span>
            <span className={className} />
          </div>
        ))}
      </div>
      <span className="text-[13px] font-bold text-ink-soft">
        {t('auth.features.mealPlan.summary')} ·{' '}
        <span className="text-mint-ink">
          {t('auth.features.mealPlan.listReady')}
        </span>
      </span>
    </FeatureCard>
  )
}

export default MealPlanCard
