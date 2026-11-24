import { memo, useCallback, useMemo } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { useHousehold } from '../../context/HouseholdContext'
import { AppText, IconButton } from '../../components/ui'
import { getSourceHost } from './helpers'
import RecipeMemberRow from './RecipeMemberRow'
import { styles } from './styles'

interface CreatorLabelProps {
  label: string
  onPress?: () => void
}

const CreatorLabel = ({ label, onPress }: CreatorLabelProps) => {
  const text = (
    <AppText variant="subtitle" tone="textSecondary" numberOfLines={1}>
      {label}
    </AppText>
  )

  if (!onPress) return <View style={styles.metaCreator}>{text}</View>

  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="link" accessibilityLabel={label} style={styles.metaCreator}>
      {text}
    </Pressable>
  )
}

interface TitleBlockProps {
  recipe: RecipeOut
  onToggleFavourite: () => void
  onDeleteRecipe: () => void
}

const TitleBlock = ({ recipe, onToggleFavourite, onDeleteRecipe }: TitleBlockProps) => {
  const { t } = useTranslation()
  const { households } = useHousehold()

  const { title, source_url: sourceUrl, creator_handle: creatorHandle, is_favourite: favourite } = recipe

  const members = useMemo(
    () =>
      recipe.household_ids
        .map((id) => households.find((household) => household.id === id))
        .filter((household): household is NonNullable<typeof household> => !!household)
        .map((household) => ({ id: household.id, name: household.name, color: household.color })),
    [recipe.household_ids, households],
  )

  const creatorLabel = creatorHandle ? t('recipes.byCreator', { handle: creatorHandle }) : getSourceHost(sourceUrl)
  const showMeta = Boolean(creatorLabel) || members.length > 0
  const showSeparator = Boolean(creatorLabel) && members.length > 0
  const favouriteLabel = favourite ? t('recipes.removeFromFavourites') : t('recipes.addToFavourites')

  const handleOpenSource = useCallback(() => {
    if (sourceUrl) void Linking.openURL(sourceUrl)
  }, [sourceUrl])

  const titleContent = (
    <Text style={styles.recipeTitle} accessibilityRole="header">
      {title}
    </Text>
  )

  return (
    <View style={styles.titleRow}>
      <View style={styles.titleColumn}>
        {sourceUrl ? (
          <Pressable onPress={handleOpenSource} accessibilityRole="link" accessibilityLabel={title}>
            {titleContent}
          </Pressable>
        ) : (
          titleContent
        )}
        {showMeta ? (
          <View style={styles.metaLine}>
            {creatorLabel ? <CreatorLabel label={creatorLabel} onPress={sourceUrl ? handleOpenSource : undefined} /> : null}
            {showSeparator ? (
              <AppText variant="subtitle" tone="textSecondary">
                ·
              </AppText>
            ) : null}
            <RecipeMemberRow members={members} onDeleteRecipe={onDeleteRecipe} />
          </View>
        ) : null}
      </View>
      <IconButton
        icon={favourite ? 'star.fill' : 'star'}
        onPress={onToggleFavourite}
        accessibilityLabel={favouriteLabel}
        iconTone={favourite ? 'action' : 'textSecondary'}
        selected={favourite}
      />
    </View>
  )
}

export default memo(TitleBlock)
