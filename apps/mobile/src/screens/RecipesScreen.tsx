import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  ListRenderItemInfo,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useRecipes } from '@platekeeper/shared/hooks/useRecipes'
import { useTags } from '@platekeeper/shared/hooks/useTags'
import { useApiClient } from '@platekeeper/shared/api/context'
import { useQueryClient } from '@tanstack/react-query'
import type { RecipeOut, Tag } from '@platekeeper/shared/types'
import BellModal from '../components/BellModal'
import type { RecipesStackParamList } from '../navigation/RecipesStack'

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipesList'>

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
  const [reordering, setReordering] = useState(false)

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerBtns}>
          <TouchableOpacity
            onPress={() => setReordering((v) => !v)}
            style={styles.headerBtn}
            accessibilityLabel={reordering ? t('common.save') : t('recipes.dragToReorder')}
            accessibilityRole="button"
          >
            <Text style={[styles.headerBtnText, reordering && styles.headerBtnActive]}>
              {reordering ? t('common.save') : '⇅'}
            </Text>
          </TouchableOpacity>
          {!reordering && (
            <TouchableOpacity
              onPress={() => navigation.navigate('ImportRecipe')}
              style={styles.headerBtn}
              accessibilityLabel={t('nav.addRecipe')}
              accessibilityRole="button"
            >
              <Text style={styles.headerAddText}>+</Text>
            </TouchableOpacity>
          )}
          <BellModal />
        </View>
      ),
    })
  }, [navigation, t, reordering])

  const recipesWithOverrides = useMemo(
    () =>
      recipes.map((r) => ({
        ...r,
        is_favourite: favouriteOverrides.has(r.id) ? favouriteOverrides.get(r.id)! : r.is_favourite,
      })),
    [recipes, favouriteOverrides],
  )

  const filtered = useMemo(() => {
    if (reordering) return recipesWithOverrides
    const q = query.trim().toLowerCase()
    return recipesWithOverrides.filter((r) => {
      const matchesQuery = !q || r.title.toLowerCase().includes(q)
      const matchesTag = !selectedTagId || r.tags.some((tag) => tag.id === selectedTagId)
      const matchesFav = !filterFavourites || r.is_favourite
      return matchesQuery && matchesTag && matchesFav
    })
  }, [recipesWithOverrides, query, selectedTagId, filterFavourites, reordering])

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
      if (reordering) return
      navigation.navigate('RecipeDetail', { recipeId: recipe.id, title: recipe.title })
    },
    [navigation, reordering],
  )

  const handleDragEnd = useCallback(
    async ({ data }: { data: RecipeOut[] }) => {
      const ids = data.map((r) => r.id)
      try {
        await qc.setQueryData(['recipes'], data)
        await api.reorderRecipes(ids)
        await qc.invalidateQueries({ queryKey: ['recipes'] })
      } catch {
        await qc.invalidateQueries({ queryKey: ['recipes'] })
      }
    },
    [api, qc],
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
        <TouchableOpacity
          style={styles.card}
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
      )
    },
    [handleRecipePress, handleToggleFavourite, favouriteOverrides, t],
  )

  const renderDraggableItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<RecipeOut>) => (
      <ScaleDecorator>
        <TouchableOpacity
          style={[styles.card, isActive && styles.cardDragging]}
          onLongPress={drag}
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
          </View>
          <View style={styles.dragHandle}>
            <Text style={styles.dragHandleText}>⠿</Text>
          </View>
        </TouchableOpacity>
      </ScaleDecorator>
    ),
    [handleRecipePress],
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

  const listHeader = useMemo(
    () =>
      reordering ? null : (
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
        </View>
      ),
    [t, query, tags, renderTag, reordering, favChip],
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

  if (reordering) {
    return (
      <DraggableFlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderDraggableItem}
        onDragEnd={handleDragEnd}
        contentContainerStyle={styles.listContent}
        containerStyle={styles.list}
      />
    )
  }

  return (
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
  )
}

const styles = StyleSheet.create({
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  headerBtnText: { fontSize: 20, color: '#7c3aed', fontWeight: '500' },
  headerBtnActive: { color: '#2563eb' },
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
  cardDragging: {
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  cardImage: { width: 80, height: 80 },
  cardImagePlaceholder: { width: 80, height: 80, backgroundColor: '#e5e7eb' },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 4 },
  cardTags: { fontSize: 12, color: '#7c3aed', marginBottom: 2 },
  cardMeta: { fontSize: 12, color: '#9ca3af' },
  dragHandle: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandleText: { fontSize: 18, color: '#d1d5db' },
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
})

export default RecipesScreen
