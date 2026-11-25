import { memo, useCallback } from 'react'
import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui'
import { DAYS_IN_WEEK, type WeekDay } from './helpers'
import { styles } from './styles'

interface ThisWeekCardProps {
  days: WeekDay[]
  plannedCount: number
  nextFreeDay: WeekDay | null
  onPlan: (iso: string) => void
  style?: StyleProp<ViewStyle>
}

const ThisWeekCard = ({ days, plannedCount, nextFreeDay, onPlan, style }: ThisWeekCardProps) => {
  const { t } = useTranslation()

  const handlePlan = useCallback(() => {
    if (nextFreeDay) onPlan(nextFreeDay.iso)
  }, [nextFreeDay, onPlan])

  return (
    <View style={[styles.weekCard, style]}>
      <View style={styles.weekCardHeader}>
        <Text style={styles.weekCardTitle}>{t('mealPlan.thisWeek')}</Text>
        <Text style={styles.weekCardCount}>{t('mealPlan.plannedCount', { count: plannedCount })}</Text>
      </View>
      <View
        style={styles.progress}
        accessible
        accessibilityLabel={t('mealPlan.plannedCount', { count: plannedCount })}
        accessibilityValue={{ min: 0, max: DAYS_IN_WEEK, now: plannedCount }}
      >
        {days.map((day) => (
          <View
            key={day.iso}
            style={[styles.progressBar, day.entries.length > 0 ? styles.progressBarDone : styles.progressBarOpen]}
          />
        ))}
      </View>
      {nextFreeDay ? (
        <View style={styles.freeDay}>
          <View style={styles.freeDayText}>
            <Text style={styles.freeDayTitle} numberOfLines={1}>
              {t('mealPlan.dayIsFree', { day: nextFreeDay.weekdayLong })}
            </Text>
            <Text style={styles.freeDaySubtitle}>{t('mealPlan.pickRecipeOrQuick')}</Text>
          </View>
          <Button label={t('mealPlan.planIt')} icon="plus" onPress={handlePlan} />
        </View>
      ) : null}
    </View>
  )
}

export default memo(ThisWeekCard)
