import { useTranslation } from 'react-i18next'
import FeatureCard from '../../FeatureCard'
import { UsersIcon } from '../../Icons'

const MEMBERS = [
  { id: 'm', initial: 'M', className: 'bg-violet-500 text-white' },
  { id: 's', initial: 'S', className: 'bg-carrot text-white -ml-2.5' },
  { id: 'a', initial: 'A', className: 'bg-green-600 text-white -ml-2.5' },
  {
    id: 'more',
    initial: '+1',
    className: 'bg-mist-soft text-ink-soft -ml-2.5',
  },
]

const HouseholdCard = () => {
  const { t } = useTranslation()

  return (
    <FeatureCard
      label={t('auth.features.household.label')}
      icon={<UsersIcon />}
      accentClassName="bg-violet-100 text-violet-700"
    >
      <div className="flex">
        {MEMBERS.map(({ id, initial, className }) => (
          <span
            key={id}
            className={`flex size-8.5 items-center justify-center rounded-full border-[2.5px] border-white text-[13px] font-extrabold ${className}`}
          >
            {initial}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-extrabold">
          {t('auth.features.household.kitchenName')}
        </span>
        <span className="text-xs font-bold text-ink-subtle">
          {t('auth.features.household.members')}
        </span>
      </div>
    </FeatureCard>
  )
}

export default HouseholdCard
