import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { MealPlanEntry } from '@carrot/shared/types'
import { AppText, Button, Thumbnail } from '../../components/ui'
import { getCourseLabel, getDishRowKicker, TONIGHT_ROW_THUMB } from './helpers'
import { styles } from './styles'
import { useTonightDish } from './useTonightDish'

interface TonightDishRowProps {
  entry: MealPlanEntry
  index: number
  onOpen: (entry: MealPlanEntry) => void
  onCook: (entry: MealPlanEntry) => void
}

const TonightDishRow = ({ entry, index, onOpen, onCook }: TonightDishRowProps) => {
  const { t } = useTranslation()
  const { recipe, title, cookLabel, handleOpen, handleCook } = useTonightDish(entry, onOpen, onCook)
  const kicker = getDishRowKicker(getCourseLabel(entry, index, t), recipe?.total_time_minutes, t)
  const accessibilityLabel = `${kicker}: ${title}`

  return (
    <Pressable accessible={false} onPress={handleOpen}>
      <View style={styles.tonightRow}>
        <Thumbnail url={recipe?.thumbnail_url ?? null} size={TONIGHT_ROW_THUMB} radiusKey="thumb" />
        <Pressable
          style={styles.tonightText}
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <AppText variant="kicker" tone="actionText" numberOfLines={1}>
            {kicker}
          </AppText>
          <AppText variant="rowTitle" numberOfLines={1}>
            {title}
          </AppText>
        </Pressable>
        {recipe ? (
          <Button
            label={t('home.cook')}
            icon="play.fill"
            variant="onImage"
            size="sm"
            accessibilityLabel={cookLabel}
            onPress={handleCook}
          />
        ) : null}
      </View>
    </Pressable>
  )
}

export default TonightDishRow
