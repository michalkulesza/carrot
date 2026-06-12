import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ListRenderItemInfo,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { useTranslation } from 'react-i18next'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useRecipes } from '@platekeeper/shared/hooks/useRecipes'
import { useTags } from '@platekeeper/shared/hooks/useTags'
import { useApiClient } from '@platekeeper/shared/api/context'
import { useQueryClient } from '@tanstack/react-query'
import type { RecipeOut, Tag } from '@platekeeper/shared/types'
import BellModal from '../components/BellModal'
import type { RecipesStackParamList } from '../navigation/RecipesStack'

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipesList'>
type SortMode = 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'edited_newest' | 'edited_oldest'

const SORT_OPTIONS: { key: SortMode; labelKey: string }[] = [
  { key: 'newest', labelKey: 'recipes.sortNewest' },
  { key: 'oldest', labelKey: 'recipes.sortOldest' },
  { key: 'edited_newest', labelKey: 'recipes.sortEditedNewest' },
  { key: 'edited_oldest', labelKey: 'recipes.sortEditedOldest' },
  { key: 'title_asc', labelKey: 'recipes.sortTitleAZ' },
  { key: 'title_desc', labelKey: 'recipes.sortTitleZA' },
]

const RecipesScreen = ({ navigation }: Props) => {
  const { t } = useTranslation()
  const { recipes, isLoading, error } = useRecipes()
  const { tags } = useTags()
  const api = useApiClient()
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [filterFavourites, setFilterFavourites] = useState(false)
  const [favouriteOverrides, setFavouriteOverrides] = useState<Map<string, boolean>>(new Map())
  const [sort, setSort] = useState<SortMode>('newest')
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map())
  const openSwipeableId = useRef<string | null>(null)

  const handleDelete = useCallback(
    (recipe: RecipeOut) => {
      Alert.alert(
        t('recipes.deleteTitle'),
        t('recipes.deleteConfirm', { title: recipe.title }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              try {
                await api.deleteRecipe(recipe.id)
                await qc.invalidateQueries({ queryKey: ['recipes'] })
              } catch {
                Alert.alert(t('recipes.failedToDelete'))
              }
            },
          },
        ],
      )
    },
    [api, qc, t],
  )

  const renderSwipeActions = useCallback(
    (item: RecipeOut) => (
      <View style={styles.swipeActions}>
        <TouchableOpacity
          style={styles.swipeEdit}
          onPress={() => {
            swipeableRefs.current.get(item.id)?.close()
            navigation.navigate('EditRecipe', { recipeId: item.id })
          }}
          accessibilityLabel={t('common.edit')}
          accessibilityRole="button"
        >
          <Text style={styles.swipeActionText}>{t('common.edit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.swipeDelete}
          onPress={() => {
            swipeableRefs.current.get(item.id)?.close()
            handleDelete(item)
          }}
          accessibilityLabel={t('common.delete')}
          accessibilityRole="button"
        >
          <Text style={styles.swipeActionText}>{t('common.delete')}</Text>
        </TouchableOpacity>
      </View>
    ),
    [handleDelete, navigation, t],
  )

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerBtns}>
          <TouchableOpacity
            onPress={() => navigation.navigate('ImportRecipe')}
            style={styles.headerBtn}
            accessibilityLabel={t('nav.addRecipe')}
            accessibilityRole="button"
          >
            <Text style={styles.headerAddText}>+</Text>
          </TouchableOpacity>
          <BellModal />
        </View>
      ),
    })
  }, [navigation, t])

  const recipesWithOverrides = useMemo(
    () =>
      recipes.map((r) => ({
        ...r,
        is_favourite: favouriteOverrides.has(r.id) ? favouriteOverrides.get(r.id)! : r.is_favourite,
      })),
    [recipes, favouriteOverrides],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = recipesWithOverrides.filter((r) => {
      const matchesQuery = !q || r.title.toLowerCase().includes(q)
      const matchesTag = !selectedTagId || r.tags.some((tag) => tag.id === selectedTagId)
      const matchesFav = !filterFavourites || r.is_favourite
      return matchesQuery && matchesTag && matchesFav
    })
    return [...base].sort((a, b) => {
      if (sort === 'title_asc') return a.title.localeCompare(b.title)
      if (sort === 'title_desc') return b.title.localeCompare(a.title)
      if (sort === 'oldest')
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sort === 'edited_newest')
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      if (sort === 'edited_oldest')
        return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [recipesWithOverrides, query, selectedTagId, filterFavourites, sort])

  const handleTagPress = useCallback(
    (tagId: string) => {
      setSelectedTagId((prev) => (prev === tagId ? null : tagId))
    },
    [],
  )

  const handleToggleFavourite = useCallback(
    async (recipe: RecipeOut) => {
      const current = favouriteOverrides.has(recipe.id)
        ? favouriteOverrides.get(recipe.id)!
        : recipe.is_favourite
      setFavouriteOverrides((prev) => new Map(prev).set(recipe.id, !current))
      try {
        const result = await api.toggleFavourite(recipe.id)
        setFavouriteOverrides((prev) => new Map(prev).set(recipe.id, result.is_favourite))
        await qc.invalidateQueries({ queryKey: ['recipes'] })
      } catch {
        setFavouriteOverrides((prev) => {
          const next = new Map(prev)
          next.set(recipe.id, current)
          return next
        })
      }
    },
    [api, favouriteOverrides, qc],
  )

  const handleRecipePress = useCallback(
    (recipe: RecipeOut) => {
      navigation.navigate('RecipeDetail', { recipeId: recipe.id, title: recipe.title })
    },
    [navigation],
  )

  const renderTag = useCallback(
    ({ item }: ListRenderItemInfo<Tag>) => {
      const isSelected = item.id === selectedTagId
      return (
        <TouchableOpacity
          onPress={() => handleTagPress(item.id)}
          style={[styles.chip, isSelected && styles.chipSelected]}
          accessibilityLabel={item.name}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
        >
          <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
            {item.name}
          </Text>
        </TouchableOpacity>
      )
    },
    [selectedTagId, handleTagPress],
  )

  const renderRecipe = useCallback(
    ({ item }: ListRenderItemInfo<RecipeOut>) => {
      const isFav = favouriteOverrides.has(item.id)
        ? favouriteOverrides.get(item.id)!
        : item.is_favourite
      return (
        <Swipeable
          ref={(ref) => {
            if (ref) swipeableRefs.current.set(item.id, ref)
            else swipeableRefs.current.delete(item.id)
          }}
          renderRightActions={() => renderSwipeActions(item)}
          onSwipeableOpen={() => {
            if (openSwipeableId.current && openSwipeableId.current !== item.id) {
              swipeableRefs.current.get(openSwipeableId.current)?.close()
            }
            openSwipeableId.current = item.id
          }}
          onSwipeableClose={() => {
            if (openSwipeableId.current === item.id) openSwipeableId.current = null
          }}
          friction={2}
          rightThreshold={40}
          containerStyle={styles.swipeContainer}
        >
          <TouchableOpacity
            style={[styles.card, styles.cardInSwipeable]}
            onPress={() => handleRecipePress(item)}
            accessibilityLabel={item.title}
            accessibilityRole="button"
          >
            {item.thumbnail_url ? (
              <Image
                source={{ uri: item.thumbnail_url }}
                style={styles.cardImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.cardImagePlaceholder} />
            )}
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.tags.length > 0 && (
                <Text style={styles.cardTags} numberOfLines={1}>
                  {item.tags.map((tg) => tg.name).join(', ')}
                </Text>
              )}
              {item.servings != null && (
                <Text style={styles.cardMeta}>
                  {t('recipes.serves')}: {item.servings}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.favBtn}
              onPress={() => handleToggleFavourite(item)}
              accessibilityLabel={isFav ? t('recipes.removeFromFavourites') : t('recipes.addToFavourites')}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.favStar, isFav && styles.favStarActive]}>★</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Swipeable>
      )
    },
    [handleRecipePress, handleToggleFavourite, renderSwipeActions, favouriteOverrides, t],
  )

  const favChip = useMemo(
    () => (
      <TouchableOpacity
        onPress={() => setFilterFavourites((v) => !v)}
        style={[styles.chip, filterFavourites && styles.chipSelected, styles.favChip]}
        accessibilityLabel={t('recipes.filterFavourites')}
        accessibilityRole="button"
        accessibilityState={{ selected: filterFavourites }}
      >
        <Text style={[styles.chipText, filterFavourites && styles.chipTextSelected]}>
          {'★ '}{t('recipes.filterFavourites')}
        </Text>
      </TouchableOpacity>
    ),
    [filterFavourites, t],
  )

  const sortChips = useMemo(
    () => (
      <View style={styles.sortChips}>
        {SORT_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            onPress={() => setSort(opt.key)}
            style={[styles.chip, sort === opt.key && styles.chipSelected]}
            accessibilityLabel={t(opt.labelKey)}
            accessibilityRole="button"
            accessibilityState={{ selected: sort === opt.key }}
          >
            <Text style={[styles.chipText, sort === opt.key && styles.chipTextSelected]}>
              {t(opt.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    ),
    [sort, t],
  )

  const listHeader = useMemo(
    () => (
      <View>
        <TextInput
          style={styles.searchInput}
          placeholder={t('recipes.searchPlaceholder')}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          accessibilityLabel={t('recipes.searchPlaceholder')}
        />
        <FlatList
          data={tags}
          keyExtractor={(item) => item.id}
          renderItem={renderTag}
          ListHeaderComponent={favChip}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagList}
          contentContainerStyle={styles.tagListContent}
        />
        {sortChips}
      </View>
    ),
    [t, query, tags, renderTag, favChip, sortChips],
  )

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" accessibilityLabel={t('common.loading')} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error.message}</Text>
      </View>
    )
  }

  return (
    <>
      <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      renderItem={renderRecipe}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {filterFavourites
              ? t('recipes.noFavourites')
              : selectedTagId
              ? t('recipes.noRecipesWithTag')
              : t('recipes.noRecipesYet')}
          </Text>
          {(selectedTagId || filterFavourites) && (
            <TouchableOpacity
              onPress={() => { setSelectedTagId(null); setFilterFavourites(false) }}
              accessibilityLabel={t('recipes.clearFilter')}
              accessibilityRole="button"
            >
              <Text style={styles.clearFilter}>{t('recipes.clearFilter')}</Text>
            </TouchableOpacity>
          )}
        </View>
      }
      style={styles.list}
      contentContainerStyle={styles.listContent}
    />
    </>
  )
}

const styles = StyleSheet.create({
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  headerAddText: {
    fontSize: 26,
    color: '#7c3aed',
    lineHeight: 30,
    fontWeight: '400',
  },
  list: { flex: 1, backgroundColor: '#f9fafb' },
  listContent: { paddingBottom: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  searchInput: {
    margin: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  tagList: { marginBottom: 8 },
  tagListContent: { paddingHorizontal: 12, gap: 8 },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginHorizontal: 12,
    marginTop: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardImage: { width: 80, height: 80 },
  cardImagePlaceholder: { width: 80, height: 80, backgroundColor: '#e5e7eb' },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 4 },
  cardTags: { fontSize: 12, color: '#7c3aed', marginBottom: 2 },
  cardMeta: { fontSize: 12, color: '#9ca3af' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 12,
  },
  clearFilter: { fontSize: 14, color: '#2563eb', fontWeight: '500' },
  favBtn: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favStar: { fontSize: 20, color: '#d1d5db' },
  favStarActive: { color: '#f59e0b' },
  favChip: { marginRight: 4 },
  sortChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  swipeContainer: { marginHorizontal: 12, marginTop: 8 },
  cardInSwipeable: { marginHorizontal: 0, marginTop: 0 },
  swipeActions: { flexDirection: 'row' },
  swipeEdit: {
    backgroundColor: '#7c3aed',
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeDelete: {
    backgroundColor: '#dc2626',
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  swipeActionText: { color: '#fff', fontSize: 13, fontWeight: '600' },
})

export default RecipesScreen
