import { memo, useCallback } from 'react'
import { Pressable, type PressableStateCallbackType, Text } from 'react-native'
import type { RecipeOut } from '@carrot/shared/types'
import ThumbnailImage from '../../components/ThumbnailImage'
import { styles } from './styles'

const getCardStyle = ({ pressed }: PressableStateCallbackType) => [styles.shelfCard, pressed && { opacity: 0.7 }]

interface HomeRecipeCardProps {
  recipe: RecipeOut
  onPress: (recipeId: string) => void
}

const HomeRecipeCard = ({ recipe, onPress }: HomeRecipeCardProps) => {
  const handlePress = useCallback(() => onPress(recipe.id), [onPress, recipe.id])

  return (
    <Pressable style={getCardStyle} onPress={handlePress} accessibilityLabel={recipe.title} accessibilityRole="button">
      <ThumbnailImage url={recipe.thumbnail_url} style={styles.shelfCardImage} size="small" />
      <Text style={styles.shelfCardTitle} numberOfLines={1}>
        {recipe.title}
      </Text>
    </Pressable>
  )
}

export default memo(HomeRecipeCard)
