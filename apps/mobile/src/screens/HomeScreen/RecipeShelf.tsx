import { memo, useCallback } from 'react'
import { FlatList, type ListRenderItemInfo, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import type { RecipeOut } from '@carrot/shared/types'
import { RecipeTile, SectionHeader } from '../../components/ui'
import { useMotion } from '../../theme'
import type { BrowsePreset } from '../BrowseScreen/helpers'
import { getShelfItemLayout, getShelfMeta, SHELF_TILE_SIZE } from './helpers'
import { styles } from './styles'

const keyExtractor = (recipe: RecipeOut) => recipe.id

const ShelfSeparator = () => <View style={styles.shelfSeparator} />

interface ShelfTileProps {
  recipe: RecipeOut
  meta?: string
  onPress: (recipe: RecipeOut) => void
}

const ShelfTile = memo(({ recipe, meta, onPress }: ShelfTileProps) => {
  const { entering } = useMotion()
  const handlePress = useCallback(() => onPress(recipe), [onPress, recipe])

  return (
    <Animated.View entering={entering}>
      <RecipeTile
        title={recipe.title}
        meta={meta}
        imageUrl={recipe.thumbnail_url}
        size={SHELF_TILE_SIZE}
        onPress={handlePress}
      />
    </Animated.View>
  )
})

interface RecipeShelfProps {
  title: string
  recipes: RecipeOut[]
  preset: BrowsePreset
}

const RecipeShelf = ({ title, recipes, preset }: RecipeShelfProps) => {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const { entering } = useMotion()

  const handleSeeAll = useCallback(() => {
    router.navigate({ pathname: '/(tabs)/browse', params: { preset, presetAt: String(Date.now()) } })
  }, [preset, router])

  const handleRecipePress = useCallback(
    (recipe: RecipeOut) => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id, title: recipe.title } }),
    [router],
  )

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RecipeOut>) => (
      <ShelfTile recipe={item} meta={getShelfMeta(item, preset, i18n.language, t)} onPress={handleRecipePress} />
    ),
    [handleRecipePress, i18n.language, preset, t],
  )

  return (
    <Animated.View entering={entering}>
      <SectionHeader title={title} actionLabel={t('home.seeAll')} onAction={handleSeeAll} />
      <FlatList
        horizontal
        data={recipes}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={ShelfSeparator}
        getItemLayout={getShelfItemLayout}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shelfContent}
        initialNumToRender={5}
        windowSize={5}
      />
    </Animated.View>
  )
}

export default memo(RecipeShelf)
