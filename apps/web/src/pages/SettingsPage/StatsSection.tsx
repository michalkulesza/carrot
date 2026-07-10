import { useTranslation } from 'react-i18next'
import type { RecipeStats } from '@carrot/shared/types'
import StatCard from './StatCard'

interface StatsSectionProps {
  stats: RecipeStats | null
}

const StatsSection = ({ stats }: StatsSectionProps) => {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-3 gap-2">
      <StatCard
        value={stats?.total_recipes ?? null}
        label={t('settings.recipesLabel')}
      />
      <StatCard
        value={stats?.total_ingredients ?? null}
        label={t('settings.ingredientsLabel')}
      />
      <StatCard value={stats?.avg_kcal ?? null} label={t('settings.avgKcal')} />
      <StatCard
        value={stats?.avg_protein ?? null}
        label={t('settings.avgProtein')}
      />
      <StatCard value={stats?.avg_fat ?? null} label={t('settings.avgFat')} />
      <StatCard
        value={stats?.avg_carbs ?? null}
        label={t('settings.avgCarbs')}
      />
    </div>
  )
}

export default StatsSection
