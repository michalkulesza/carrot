import { memo, useCallback } from 'react'
import { FlatList, Pressable, type ListRenderItemInfo, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import type { RecipeOut } from '@carrot/shared/types'
import type { BrowsePreset } from '../BrowseScreen/helpers'
import HomeRecipeCard from './HomeRecipeCard'
import { getShelfItemLayout } from './helpers'
import { styles } from './styles'

const keyExtractor = (recipe: RecipeOut) => recipe.id

interface RecipeShelfProps {
  title: string
  recipes: RecipeOut[]
  preset: BrowsePreset
}

const RecipeShelf = ({ title, recipes, preset }: RecipeShelfProps) => {
  const { t } = useTranslation()
  const router = useRouter()

  const handleSeeAll = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    router.navigate({ pathname: '/(tabs)/browse', params: { preset, presetAt: String(Date.now()) } })
  }, [preset, router])

  const handleRecipePress = useCallback(
    (recipeId: string) => {
      const recipe = recipes.find((r) => r.id === recipeId)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      router.push({ pathname: '/recipe/[id]', params: { id: recipeId, title: recipe?.title } })
    },
    [recipes, router],
  )

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RecipeOut>) => <HomeRecipeCard recipe={item} onPress={handleRecipePress} />,
    [handleRecipePress],
  )

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        <Pressable
          onPress={handleSeeAll}
          hitSlop={12}
          accessibilityLabel={t('home.seeAll')}
          accessibilityRole="button"
        >
          <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={recipes}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getShelfItemLayout}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shelfContent}
        initialNumToRender={5}
        windowSize={5}
      />
    </View>
  )
}

export default memo(RecipeShelf)
