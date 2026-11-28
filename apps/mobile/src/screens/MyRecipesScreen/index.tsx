import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, View, type ListRenderItemInfo } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useMyRecipes } from '@carrot/shared/hooks/useRecipes'
import type { RecipeOut } from '@carrot/shared/types'
import { AppText, CompactRecipeRow, SearchField } from '../../components/ui'
import { useHousehold } from '../../context/HouseholdContext'
import { useEdgeEffectHeader } from '../../hooks/useEdgeEffectHeader'
import { useTapGuard } from '../../hooks/useTapGuard'
import { styles } from './styles'
import { useMyRecipeActions } from './useMyRecipeActions'

const SEARCH_DEBOUNCE_MS = 200

const keyExtractor = (recipe: RecipeOut) => recipe.id

const MyRecipesScreen = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const acceptTap = useTapGuard()
  const { activeHousehold } = useHousehold()
  const { data: recipes = [], isLoading, isError } = useMyRecipes()
  const { busyIds, confirmDelete } = useMyRecipeActions(activeHousehold)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  const filtered = useMemo(
    () => (debouncedQuery ? recipes.filter((recipe) => recipe.title.toLowerCase().includes(debouncedQuery)) : recipes),
    [recipes, debouncedQuery],
  )

  const headerOptions = useEdgeEffectHeader(t('settings.myRecipes'))

  const handleOpenRecipe = useCallback(
    (recipe: RecipeOut) => {
      if (!acceptTap()) return

      router.push({ pathname: '/recipe/[id]', params: { id: recipe.id, title: recipe.title } })
    },
    [acceptTap, router],
  )

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<RecipeOut>) => (
      <CompactRecipeRow
        recipe={item}
        busy={busyIds.has(item.id)}
        showDivider={index < filtered.length - 1}
        onPress={handleOpenRecipe}
        onLongPress={confirmDelete}
      />
    ),
    [busyIds, filtered.length, handleOpenRecipe, confirmDelete],
  )

  const captionText = activeHousehold
    ? t('settings.myRecipesAddedTo', { name: activeHousehold.name })
    : t('settings.myRecipesAddedPersonal')

  const listHeader = (
    <View style={styles.header}>
      <SearchField value={query} onChangeText={setQuery} placeholder={t('settings.myRecipesSearch', { count: recipes.length })} />
      <AppText variant="meta" tone="textSecondary" style={styles.caption}>
        {captionText}
      </AppText>
    </View>
  )

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={headerOptions} />
        <View style={styles.centered}>
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        </View>
      </View>
    )
  }

  const emptyMessage = isError
    ? t('common.somethingWentWrong')
    : recipes.length === 0
      ? t('settings.myRecipesEmpty')
      : t('settings.myRecipesNoResults')

  const listEmpty = (
    <View style={styles.centered}>
      <AppText variant="body" tone="textTertiary" style={styles.message}>
        {emptyMessage}
      </AppText>
    </View>
  )

  return (
    <View style={styles.screen}>
      <Stack.Screen options={headerOptions} />
      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        style={styles.list}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </View>
  )
}

export default MyRecipesScreen
