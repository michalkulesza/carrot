import { ActivityIndicator, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRecipeStats } from '@carrot/shared/hooks/useRecipes'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { styles } from './styles'

const StatsSection = () => {
  const { t } = useTranslation()
  const { data: stats, isLoading } = useRecipeStats()
  const { showSpinner } = useScreenLoading(isLoading)

  if (showSpinner) {
    return (
      <View style={styles.statsRow}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    )
  }

  return (
    <View style={styles.statsRow}>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>{stats?.total_recipes ?? '—'}</Text>
        <Text style={styles.statLabel}>{t('settings.recipesLabel')}</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>{stats?.total_ingredients ?? '—'}</Text>
        <Text style={styles.statLabel}>{t('settings.ingredientsLabel')}</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>
          {stats?.avg_kcal != null ? Math.round(stats.avg_kcal) : '—'}
        </Text>
        <Text style={styles.statLabel}>{t('settings.avgKcal')}</Text>
      </View>
    </View>
  )
}

export default StatsSection
