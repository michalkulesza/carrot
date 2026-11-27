import { memo, useCallback } from 'react'
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import type { MealPlanEntry } from '@carrot/shared/types'
import { palette } from '../../theme'
import { lightHaptic } from '../../components/ui/haptics'
import DishRow from './DishRow'
import type { WeekDay } from './helpers'
import { styles } from './styles'
import type { DragToMove } from './useDragToMove'

interface DayCardProps {
  day: WeekDay
  isDropTarget: boolean
  draggingEntryId: string | null
  createGesture: DragToMove['createGesture']
  onAdd: (iso: string) => void
  onDishPress: (entry: MealPlanEntry) => void
  onDayLayout: (iso: string, top: number, height: number) => void
}

const DayCard = ({ day, isDropTarget, draggingEntryId, createGesture, onAdd, onDishPress, onDayLayout }: DayCardProps) => {
  const { t } = useTranslation()

  const { iso, entries, isToday, isPast } = day
  const hasEntries = entries.length > 0

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => onDayLayout(iso, e.nativeEvent.layout.y, e.nativeEvent.layout.height),
    [onDayLayout, iso],
  )

  const handleAdd = useCallback(() => {
    lightHaptic()
    onAdd(iso)
  }, [onAdd, iso])

  const cardStyle = [
    styles.dayCard,
    isToday && styles.dayCardToday,
    isDropTarget && styles.dayCardDropTarget,
    isPast && styles.dayCardPast,
  ]
  const weekdayStyle = [styles.weekday, isToday && styles.dateTextToday]
  const dayNumberStyle = [styles.dayNumber, isToday && styles.dateTextToday]

  return (
    <View style={cardStyle} onLayout={handleLayout}>
      <View style={styles.dateColumn}>
        <Text style={weekdayStyle}>{day.weekdayShort}</Text>
        <Text style={dayNumberStyle}>{day.dayNumber}</Text>
      </View>
      <View style={styles.dishes}>
        {entries.map((entry) => (
          <DishRow
            key={entry.id}
            entry={entry}
            isDragSource={entry.id === draggingEntryId}
            createGesture={createGesture}
            onPress={onDishPress}
          />
        ))}
        {hasEntries ? (
          <Pressable
            style={styles.addMoreButton}
            onPress={handleAdd}
            accessibilityRole="button"
            accessibilityLabel={t('mealPlan.addAnotherDish', { day: day.weekdayLong })}
          >
            <SymbolView name="plus" size={14} weight="semibold" tintColor={palette.actionText} />
            <Text style={styles.addMoreLabel}>{t('common.add')}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.addDishButton}
            onPress={handleAdd}
            accessibilityRole="button"
            accessibilityLabel={t('mealPlan.addDishTo', { day: day.weekdayLong })}
          >
            <SymbolView name="plus" size={16} weight="semibold" tintColor={palette.actionText} />
            <Text style={styles.addDishLabel}>{t('mealPlan.addDish')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

export default memo(DayCard)
