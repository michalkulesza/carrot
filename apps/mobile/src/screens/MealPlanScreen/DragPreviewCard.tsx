import { memo } from 'react'
import { Text, View } from 'react-native'
import Animated, { type AnimatedStyle } from 'react-native-reanimated'
import type { ViewStyle } from 'react-native'
import type { MealPlanEntry } from '@carrot/shared/types'
import NetworkImage from '../../components/NetworkImage'
import { PLACEHOLDER_URL, proxyThumbnailUrl } from '../../api/thumbnailUrl'
import { styles } from './styles'

interface DragPreviewCardProps {
  entry: MealPlanEntry | undefined
  style: AnimatedStyle<ViewStyle>
}

const DragPreviewCard = ({ entry, style }: DragPreviewCardProps) => {
  const title = entry?.recipe?.title ?? entry?.text ?? ''
  const thumbUri = entry?.recipe
    ? proxyThumbnailUrl(entry.recipe.thumbnail_url)
    : PLACEHOLDER_URL || null

  return (
    <Animated.View style={[styles.dragPreviewCard, style]} pointerEvents="none">
      {entry && (
        thumbUri ? (
          <NetworkImage uri={thumbUri} style={styles.dragPreviewThumb} recyclingKey={thumbUri} />
        ) : (
          <View style={styles.dragPreviewThumbPlaceholder} />
        )
      )}
      <Text style={styles.dragPreviewTitle} numberOfLines={2}>
        {title}
      </Text>
    </Animated.View>
  )
}

export default memo(DragPreviewCard)
