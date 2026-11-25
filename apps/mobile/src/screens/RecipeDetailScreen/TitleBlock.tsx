import { memo, useCallback } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { IconButton } from '../../components/ui'
import Byline from './Byline'
import { styles } from './styles'

interface TitleBlockProps {
  recipe: RecipeOut
  onToggleFavourite: () => void
  onDeleteRecipe: () => void
}

const TitleBlock = ({ recipe, onToggleFavourite, onDeleteRecipe }: TitleBlockProps) => {
  const { t } = useTranslation()

  const { title, source_url: sourceUrl, is_favourite: favourite } = recipe

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
        <Byline recipe={recipe} onDeleteRecipe={onDeleteRecipe} />
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
