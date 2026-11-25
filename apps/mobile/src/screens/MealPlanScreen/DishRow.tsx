import { memo, useCallback, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { GestureDetector } from 'react-native-gesture-handler'
import { useTranslation } from 'react-i18next'
import { isOptimisticEntry } from '@carrot/shared/hooks/useMealPlanMutations'
import type { MealPlanEntry } from '@carrot/shared/types'
import { formatRecipeMeta } from '@carrot/shared/utils/recipeMeta'
import DishThumb from './DishThumb'
import { getEntryTitle } from './helpers'
import { styles } from './styles'
import type { DragToMove } from './useDragToMove'

interface DishRowProps {
  entry: MealPlanEntry
  isDragSource: boolean
  createGesture: DragToMove['createGesture']
  onPress: (entry: MealPlanEntry) => void
}

const DishRow = ({ entry, isDragSource, createGesture, onPress }: DishRowProps) => {
  const { t } = useTranslation()

  const pending = isOptimisticEntry(entry)
  const gesture = useMemo(
    () => createGesture(entry.id, entry.date).enabled(!pending),
    [createGesture, entry.id, entry.date, pending],
  )
  const handlePress = useCallback(() => onPress(entry), [onPress, entry])

  const title = getEntryTitle(entry)
  const meta = entry.recipe ? formatRecipeMeta(entry.recipe, t) : t('mealPlan.quickMeal')
  const rowStyle = [styles.dishRow, (isDragSource || pending) && styles.dishRowGhost]

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        style={rowStyle}
        onPress={handlePress}
        disabled={pending}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={t('mealPlan.dragHint')}
      >
        <DishThumb entry={entry} />
        <View style={styles.dishText}>
          <Text style={styles.dishTitle} numberOfLines={2}>
            {title}
          </Text>
          {meta ? <Text style={styles.dishMeta}>{meta}</Text> : null}
        </View>
      </Pressable>
    </GestureDetector>
  )
}

export default memo(DishRow)
