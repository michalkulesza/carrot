import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, View, type ListRenderItemInfo } from 'react-native'
import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { RecipeOut } from '@carrot/shared/types'
import { AppText, Thumbnail } from '../ui'
import { palette, space } from '../../theme'
import { proxyThumbnailUrl } from '../../api/thumbnailUrl'
import { styles } from './styles'

interface PersonalRecipeRowProps {
  recipe: RecipeOut
  isLinking: boolean
  isBusy: boolean
  onSelect: (id: string) => void
}

const PersonalRecipeRow = ({ recipe, isLinking, isBusy, onSelect }: PersonalRecipeRowProps) => {
  const { t } = useTranslation()
  const thumbnailUrl = proxyThumbnailUrl(recipe.thumbnail_url)
  const handlePress = useCallback(() => onSelect(recipe.id), [onSelect, recipe.id])

  const getRowStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.personalRow, pressed && styles.personalRowPressed],
    [],
  )

  return (
    <Pressable
      style={getRowStyle}
      onPress={handlePress}
      disabled={isBusy}
      accessibilityLabel={t('addRecipe.addPersonalRecipe', { title: recipe.title })}
      accessibilityRole="button"
    >
      <Thumbnail url={thumbnailUrl} size="xs" glyph="book" />
      <AppText variant="bodyLarge" style={styles.personalTitle} numberOfLines={2}>
        {recipe.title}
      </AppText>
      {isLinking ? (
        <ActivityIndicator color={palette.action} />
      ) : (
        <AppText variant="button" tone="actionText">
          {t('common.add')}
        </AppText>
      )}
    </Pressable>
  )
}

const PersonalRecipeSeparator = () => <View style={styles.personalSeparator} />

interface PersonalRecipePickerViewProps {
  recipes: RecipeOut[]
  isLoading: boolean
  linkingRecipeId: string | null
  onSelect: (id: string) => void
}

const PersonalRecipePickerView = ({ recipes, isLoading, linkingRecipeId, onSelect }: PersonalRecipePickerViewProps) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
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
        isLinking={linkingRecipeId === item.id}
        isBusy={linkingRecipeId !== null}
        onSelect={onSelect}
      />
    ),
    [linkingRecipeId, onSelect],
  )
  const keyExtractor = useCallback((recipe: RecipeOut) => recipe.id, [])

  const emptyLabel = search.trim() ? t('mealPlan.noRecipesMatch') : t('mealPlan.noRecipesYet')
  const contentStyle = useMemo(
    () => [styles.personalList, { paddingBottom: Math.max(insets.bottom, space.lg) }],
    [insets.bottom],
  )

  const listHeader = (
    <View style={styles.personalHeader}>
      <AppText variant="bodyLarge" style={styles.sheetTitle}>
        {t('addRecipe.fromPersonalLibrary')}
      </AppText>
      <BottomSheetTextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('recipes.searchPlaceholder')}
        placeholderTextColor={palette.placeholder}
        style={styles.personalSearch}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={t('recipes.searchPlaceholder')}
      />
    </View>
  )

  // Header lives inside the list so BottomSheetFlatList stays the sheet's single scrollable child.
  return (
    <BottomSheetFlatList
      contentContainerStyle={contentStyle}
      data={isLoading ? [] : filteredRecipes}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={listHeader}
      ItemSeparatorComponent={PersonalRecipeSeparator}
      ListEmptyComponent={
        isLoading ? (
          <ActivityIndicator style={styles.personalLoading} size="large" />
        ) : (
          <AppText variant="body" tone="textSecondary" style={styles.personalEmpty}>
            {emptyLabel}
          </AppText>
        )
      }
    />
  )
}

export default PersonalRecipePickerView
