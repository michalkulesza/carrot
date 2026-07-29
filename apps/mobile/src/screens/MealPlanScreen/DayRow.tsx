import { memo, useCallback } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import type { MealPlanEntry } from '@carrot/shared/types'
import { formatWeekdayShort } from '@carrot/shared/utils/dateUtils'
import NetworkImage from '../../components/NetworkImage'
import { proxyThumbnailUrl } from '../../api/thumbnailUrl'
import { colors } from '../../theme/colors'
import { styles } from './styles'

// A no-op onPress claims the touch responder for taps landing on the handle, so they
// never bubble up to the row's own Pressable and open the view/change/remove actions.
const stopPress = () => {}

interface DayRowProps {
  date: Date
  entry: MealPlanEntry | undefined
  isToday: boolean
  onPress: (date: Date) => void
  isDraggingSource: boolean
}

const DayRow = memo(({ date, entry, isToday, onPress, isDraggingSource }: DayRowProps) => {
  const { t, i18n } = useTranslation()
  const weekday = formatWeekdayShort(date, i18n.language)
  const dayLabel = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(date)
  const monthLabel = new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(date)
  const visibleEntry = isDraggingSource ? undefined : entry
  const entryTitle = visibleEntry?.recipe?.title ?? visibleEntry?.text
  const thumbUri = visibleEntry?.recipe ? proxyThumbnailUrl(visibleEntry.recipe.thumbnail_url) : null
  const accessibilityHint = entry ? t('mealPlan.dragHint') : undefined
  const accessibilityLabel = `${dayLabel}${entryTitle ? ': ' + entryTitle : ''}`

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
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
    >
      <View style={styles.dayRowLeft}>
        <Text style={[styles.dayRowWeekday, isToday && styles.dayRowTextToday]}>{weekday}</Text>
        <Text style={[styles.dayRowNum, isToday && styles.dayRowTextToday]}>{date.getDate()}</Text>
        <Text style={[styles.dayRowMonth, isToday && styles.dayRowTextToday]}>{monthLabel}</Text>
      </View>
      <View style={styles.dayRowDivider} />
      {visibleEntry && (
        thumbUri ? (
          <NetworkImage uri={thumbUri} style={styles.dayRowThumb} recyclingKey={thumbUri} />
        ) : (
          <View style={styles.dayRowThumbPlaceholder} />
        )
      )}
      <View style={styles.dayRowContent}>
        {visibleEntry ? (
          <Text style={styles.dayRowRecipe} numberOfLines={2}>{entryTitle}</Text>
        ) : (
          <Text style={styles.dayRowEmpty}>{t('mealPlan.addDish')}</Text>
        )}
      </View>
      {visibleEntry && (
        <Pressable
          style={styles.dayRowDragHandle}
          onPress={stopPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Feather name="menu" size={18} color={colors.tertiaryLabel} />
        </Pressable>
      )}
    </Pressable>
  )
}, (prev, next) =>
  prev.isToday === next.isToday &&
  prev.onPress === next.onPress &&
  prev.date === next.date &&
  prev.isDraggingSource === next.isDraggingSource &&
  prev.entry?.recipe?.id === next.entry?.recipe?.id &&
  prev.entry?.recipe?.thumbnail_url === next.entry?.recipe?.thumbnail_url &&
  prev.entry?.text === next.entry?.text
)

export default DayRow
