import { memo, useCallback } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { MealPlanEntry } from '@carrot/shared/types'
import { formatWeekdayShort } from '@carrot/shared/utils/dateUtils'
import { proxyThumbnailUrl } from '../../api/thumbnailUrl'
import { styles } from './styles'

interface DayRowProps {
  date: Date
  entry: MealPlanEntry | undefined
  isToday: boolean
  onPress: (date: Date) => void
}

const DayRow = memo(({ date, entry, isToday, onPress }: DayRowProps) => {
  const { t, i18n } = useTranslation()
  const weekday = formatWeekdayShort(date, i18n.language)
  const dayLabel = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(date)
  const monthLabel = dayLabel.replace(/^\d+\s*/, '')
  const thumbUri = entry ? proxyThumbnailUrl(entry.recipe.thumbnail_url) : null
  const accessibilityLabel = `${dayLabel}${entry ? ': ' + entry.recipe.title : ''}`

  const getDayRowStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.dayRow, isToday && styles.dayRowToday, pressed && { opacity: 0.7 }],
    [isToday],
  )

  const handlePress = useCallback(() => onPress(date), [onPress, date])

  return (
    <Pressable
      style={getDayRowStyle}
      onPress={handlePress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <View style={styles.dayRowLeft}>
        <Text style={[styles.dayRowWeekday, isToday && styles.dayRowTextToday]}>{weekday}</Text>
        <Text style={[styles.dayRowNum, isToday && styles.dayRowTextToday]}>{date.getDate()}</Text>
        <Text style={[styles.dayRowMonth, isToday && styles.dayRowTextToday]}>{monthLabel}</Text>
      </View>
      <View style={styles.dayRowDivider} />
      <View style={styles.dayRowContent}>
        {entry ? (
          <Text style={styles.dayRowRecipe} numberOfLines={2}>{entry.recipe.title}</Text>
        ) : (
          <Text style={styles.dayRowEmpty}>{t('mealPlan.addDish')}</Text>
        )}
      </View>
      {entry && (
        thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.dayRowThumb} resizeMode="cover" />
        ) : (
          <View style={styles.dayRowThumbPlaceholder} />
        )
      )}
    </Pressable>
  )
}, (prev, next) =>
  prev.isToday === next.isToday &&
  prev.onPress === next.onPress &&
  prev.date === next.date &&
  prev.entry?.recipe.id === next.entry?.recipe.id &&
  prev.entry?.recipe.thumbnail_url === next.entry?.recipe.thumbnail_url
)

export default DayRow
