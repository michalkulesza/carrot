import { memo, useCallback } from 'react'
import { Pressable, type PressableStateCallbackType, Text, View } from 'react-native'
import Reanimated, { FadeInDown } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import Avatar from '../../components/Avatar'
import MarqueeText from '../../components/MarqueeText'
import MarqueeRow from '../../components/MarqueeRow'
import { MarqueeSyncSlots } from '../../components/MarqueeSync'
import ThumbnailImage from '../../components/ThumbnailImage'
import type { HouseholdAvatar } from './helpers'
import { styles } from './styles'

const ENTERING = FadeInDown.duration(250)
const FAVOURITE_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }

const getCardStyle = ({ pressed }: PressableStateCallbackType) => [styles.card, pressed && { opacity: 0.7 }]
const getFavouriteStyle = ({ pressed }: PressableStateCallbackType) => [styles.favBtn, pressed && { opacity: 0.7 }]

interface RecipeCardProps {
  recipe: RecipeOut
  householdAvatars: HouseholdAvatar[]
  plain: boolean
  isNew: boolean
  onPress: (recipeId: string) => void
  onLongPress: (recipeId: string) => void
  onToggleFavourite: (recipeId: string) => void
}

const AnimatedTitleAndTags = ({ recipe }: { recipe: RecipeOut }) => {
  const { t } = useTranslation()

  return (
    <MarqueeSyncSlots>
      {({ title: titleTurn, tags: tagsTurn }) => (
        <>
          <MarqueeText
            text={recipe.title}
            style={styles.cardTitle}
            containerStyle={styles.cardTitleMarquee}
            turn={titleTurn.turn}
            onOverflowChange={titleTurn.onOverflowChange}
            onDone={titleTurn.onDone}
          />
          {recipe.tags.length > 0 ? (
            <MarqueeRow
              containerStyle={styles.cardTagRow}
              gap={4}
              turn={tagsTurn.turn}
              onOverflowChange={tagsTurn.onOverflowChange}
              onDone={tagsTurn.onDone}
            >
              {recipe.tags.map((tg) => (
                <View key={tg.id} style={styles.cardTagPill}>
                  <Text style={styles.cardTagPillText} numberOfLines={1}>
                    {tTag(tg.name, t)}
                  </Text>
                </View>
              ))}
            </MarqueeRow>
          ) : (
            <Text style={[styles.cardTags, styles.cardTagsEmpty]}>{t('tags.noTags')}</Text>
          )}
        </>
      )}
    </MarqueeSyncSlots>
  )
}

const PlainTitleAndTags = ({ recipe }: { recipe: RecipeOut }) => {
  const { t } = useTranslation()
  const tagsLabel = recipe.tags.map((tg) => tTag(tg.name, t)).join(' · ')

  return (
    <>
      <Text style={[styles.cardTitle, styles.cardTitlePlain]} numberOfLines={1}>
        {recipe.title}
      </Text>
      {recipe.tags.length > 0 ? (
        <Text style={styles.cardTags} numberOfLines={1}>
          {tagsLabel}
        </Text>
      ) : (
        <Text style={[styles.cardTags, styles.cardTagsEmpty]}>{t('tags.noTags')}</Text>
      )}
    </>
  )
}

const RecipeCard = ({
  recipe,
  householdAvatars,
  plain,
  isNew,
  onPress,
  onLongPress,
  onToggleFavourite,
}: RecipeCardProps) => {
  const { t } = useTranslation()
  const { id, is_favourite: isFavourite } = recipe
  const favouriteLabel = isFavourite ? t('recipes.removeFromFavourites') : t('recipes.addToFavourites')

  const handlePress = useCallback(() => onPress(id), [onPress, id])
  const handleLongPress = useCallback(() => onLongPress(id), [onLongPress, id])
  const handleToggleFavourite = useCallback(() => onToggleFavourite(id), [onToggleFavourite, id])

  return (
    <Reanimated.View entering={isNew ? ENTERING : undefined}>
      <Pressable
        style={getCardStyle}
        onPress={handlePress}
        onLongPress={handleLongPress}
        accessibilityLabel={recipe.title}
        accessibilityRole="button"
      >
        <ThumbnailImage url={recipe.thumbnail_url} style={styles.cardImage} size="small" />
        <View style={styles.cardBody}>
          {plain ? <PlainTitleAndTags recipe={recipe} /> : <AnimatedTitleAndTags key={id} recipe={recipe} />}
          <View style={styles.cardMetaRow}>
            <View style={styles.cardHouseholdAvatars}>
              {householdAvatars.map(({ key, ...avatarProps }) => (
                <Avatar key={key} {...avatarProps} size={18} />
              ))}
            </View>
            {recipe.kcal_per_serving != null && <Text style={styles.cardMeta}>{`${recipe.kcal_per_serving} kcal`}</Text>}
          </View>
        </View>
        <Pressable
          style={getFavouriteStyle}
          onPress={handleToggleFavourite}
          accessibilityLabel={favouriteLabel}
          accessibilityRole="button"
          hitSlop={FAVOURITE_HIT_SLOP}
        >
          <Text style={[styles.favStar, isFavourite && styles.favStarActive]}>★</Text>
        </Pressable>
      </Pressable>
    </Reanimated.View>
  )
}

export default memo(RecipeCard)
