import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  PlatformColor,
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native'
import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import NetworkImage from '../NetworkImage'
import { proxyThumbnailUrl } from '../../api/thumbnailUrl'
import { styles } from './styles'

const PersonalRecipeRow = ({
  recipe,
  isLinking,
  onSelect,
}: {
  recipe: RecipeOut
  isLinking: boolean
  onSelect: (id: string) => void
}) => {
  const { t } = useTranslation()
  const thumbnailUrl = proxyThumbnailUrl(recipe.thumbnail_url)
  const handlePress = useCallback(() => onSelect(recipe.id), [onSelect, recipe.id])

  return (
    <Pressable
      style={({ pressed }) => [styles.personalRecipeRow, pressed && styles.personalRecipeRowPressed]}
      onPress={handlePress}
      disabled={isLinking}
      accessibilityLabel={t('addRecipe.addPersonalRecipe', { title: recipe.title })}
      accessibilityRole="button"
    >
      <View style={styles.personalRecipeThumbnail}>
        {thumbnailUrl ? (
          <NetworkImage uri={thumbnailUrl} style={styles.personalRecipeThumbnail} recyclingKey={recipe.id} />
        ) : (
          <Feather name="book-open" size={20} color={PlatformColor('secondaryLabel') as unknown as string} />
        )}
      </View>
      <Text style={styles.personalRecipeTitle} numberOfLines={2}>{recipe.title}</Text>
      {isLinking ? (
        <ActivityIndicator color={PlatformColor('systemBlue') as unknown as string} />
      ) : (
        <Text style={styles.personalRecipeAdd}>{t('common.add')}</Text>
      )}
    </Pressable>
  )
}

const PersonalRecipeSeparator = () => <View style={styles.personalRecipeSeparator} />

const PersonalRecipePickerView = ({
  recipes,
  isLoading,
  linkingRecipeId,
  onSelect,
}: {
  recipes: RecipeOut[]
  isLoading: boolean
  linkingRecipeId: string | null
  onSelect: (id: string) => void
}) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const filteredRecipes = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    if (!normalizedSearch) return recipes

    return recipes.filter((recipe) => recipe.title.toLocaleLowerCase().includes(normalizedSearch))
  }, [recipes, search])
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RecipeOut>) => (
      <PersonalRecipeRow
        recipe={item}
        isLinking={linkingRecipeId !== null}
        onSelect={onSelect}
      />
    ),
    [linkingRecipeId, onSelect],
  )
  const keyExtractor = useCallback((recipe: RecipeOut) => recipe.id, [])

  const emptyLabel = search.trim() ? t('mealPlan.noRecipesMatch') : t('mealPlan.noRecipesYet')

  const searchInput = (
    <BottomSheetTextInput
      value={search}
      onChangeText={setSearch}
      placeholder={t('recipes.searchPlaceholder')}
      placeholderTextColor={PlatformColor('tertiaryLabel') as unknown as string}
      style={styles.personalRecipeSearch}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      accessibilityLabel={t('recipes.searchPlaceholder')}
    />
  )

  if (isLoading) {
    return (
      <View style={styles.personalRecipePicker}>
        {searchInput}
        <ActivityIndicator style={styles.personalRecipeLoading} size="large" />
      </View>
    )
  }

  // The search input lives inside the list's header (rather than as a sibling above it)
  // so it's part of the sheet's single registered scrollable — that's what lets the
  // bottom sheet auto-scroll it above the keyboard when focused.
  return (
    <BottomSheetFlatList
      style={styles.personalRecipeListWrap}
      contentContainerStyle={styles.personalRecipePicker}
      data={filteredRecipes}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={searchInput}
      ItemSeparatorComponent={PersonalRecipeSeparator}
      ListEmptyComponent={<Text style={styles.personalRecipeEmpty}>{emptyLabel}</Text>}
    />
  )
}

export default PersonalRecipePickerView
