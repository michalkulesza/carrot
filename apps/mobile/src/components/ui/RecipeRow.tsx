import { memo, useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { type EntryOrExitLayoutType } from 'react-native-reanimated'
import { Link } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import AppText from './AppText'
import FavouriteButton from './FavouriteButton'
import PillRow from './PillRow'
import Thumbnail from './Thumbnail'
import { lightHaptic } from './haptics'
import { palette, space, screenGutter, usePressScale } from '../../theme'

interface RecipeRowProps {
  recipe: RecipeOut
  entering?: EntryOrExitLayoutType
  exiting?: EntryOrExitLayoutType
  showDivider?: boolean
  onLongPress: (recipeId: string) => void
  onToggleFavourite: (recipeId: string) => void
}

const THUMBNAIL_SIZE = 88
const DIVIDER_WIDTH = 0.5

export const RECIPE_ROW_HEIGHT = THUMBNAIL_SIZE + space.md * 2 + DIVIDER_WIDTH

const RecipeRow = ({
  recipe,
  entering,
  exiting,
  showDivider = true,
  onLongPress,
  onToggleFavourite,
}: RecipeRowProps) => {
  const { t } = useTranslation()
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()
  const { id, title, tags, total_time_minutes: minutes, kcal_per_serving: kcal, is_favourite: favourite } = recipe

  const meta = [minutes ? t('browse.minutes', { count: minutes }) : null, kcal ? t('browse.kcal', { count: kcal }) : null]
    .filter(Boolean)
    .join(' · ')
  const tagItems = useMemo(() => tags.map((tag) => ({ key: tag.id, label: tTag(tag.name, t) })), [tags, t])
  const tagItemsKey = tagItems.map((item) => item.label).join('|')
  const favouriteLabel = favourite ? t('recipes.removeFromFavourites') : t('recipes.addToFavourites')

  const href = useMemo(() => ({ pathname: '/recipe/[id]' as const, params: { id, title } }), [id, title])
  const handleLongPress = useCallback(() => onLongPress(id), [onLongPress, id])
  const handleToggleFavourite = useCallback(() => onToggleFavourite(id), [onToggleFavourite, id])
  const containerStyle = useMemo(() => [styles.container, animatedStyle], [animatedStyle])

  return (
    <Animated.View entering={entering} exiting={exiting}>
      <Link href={href} push asChild onPress={lightHaptic}>
        <Pressable
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          onLongPress={handleLongPress}
          accessibilityRole="button"
          accessibilityLabel={title}
        >
          <Animated.View style={containerStyle}>
            <Link.AppleZoom>
              <Thumbnail url={recipe.thumbnail_url} size="row" radiusKey="control" />
            </Link.AppleZoom>
            <View style={styles.body}>
              <AppText variant="cardTitle" numberOfLines={2}>
                {title}
              </AppText>
              {meta ? (
                <AppText variant="meta" tone="textSecondary" numberOfLines={1}>
                  {meta}
                </AppText>
              ) : null}
              {tagItems.length > 0 ? <PillRow key={tagItemsKey} items={tagItems} /> : null}
            </View>
            <FavouriteButton
              favourite={favourite}
              onToggle={handleToggleFavourite}
              accessibilityLabel={favouriteLabel}
            />
            {showDivider ? <View style={styles.divider} /> : null}
          </Animated.View>
        </Pressable>
      </Link>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    height: RECIPE_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: screenGutter,
  },
  body: { flex: 1, gap: space.xs },
  divider: {
    position: 'absolute',
    left: screenGutter,
    right: screenGutter,
    bottom: 0,
    height: DIVIDER_WIDTH,
    backgroundColor: palette.dividerCard,
  },
})

export default memo(RecipeRow)
