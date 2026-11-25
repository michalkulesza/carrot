import { memo, useMemo } from 'react'
import { Text } from 'react-native'
import Animated from 'react-native-reanimated'
import type { MealPlanEntry } from '@carrot/shared/types'
import DishThumb from './DishThumb'
import { getEntryTitle } from './helpers'
import { styles } from './styles'

interface DragPreviewProps {
  entry: MealPlanEntry | null
  animatedStyle: object
}

const DragPreview = ({ entry, animatedStyle }: DragPreviewProps) => {
  const style = useMemo(() => [styles.dragPreview, animatedStyle], [animatedStyle])

  return (
    <Animated.View style={style} pointerEvents="none">
      {entry ? <DishThumb entry={entry} /> : null}
      <Text style={styles.dishTitle} numberOfLines={2}>
        {entry ? getEntryTitle(entry) : ''}
      </Text>
    </Animated.View>
  )
}

export default memo(DragPreview)
