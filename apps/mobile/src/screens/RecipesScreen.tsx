import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import { Swipeable } from 'react-native-gesture-handler'
import { useTranslation } from 'react-i18next'
import { useNavigation, useRouter } from 'expo-router'
import { useRecipes } from '@platekeeper/shared/hooks/useRecipes'
import { useTags } from '@platekeeper/shared/hooks/useTags'
import { useApiClient } from '@platekeeper/shared/api/context'
import { useQueryClient } from '@tanstack/react-query'
import type { RecipeOut, Tag } from '@platekeeper/shared/types'
import { tTag } from '@platekeeper/shared/utils/tagUtils'
import { Feather } from '@expo/vector-icons'
import BellMenu from '../components/BellMenu'
import { colors } from '../theme/colors'
import { proxyThumbnailUrl } from '../api/thumbnailUrl'

type SortMode = 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'edited_newest' | 'edited_oldest'

const SORT_OPTIONS: { key: SortMode; labelKey: string }[] = [
  { key: 'newest', labelKey: 'recipes.sortNewest' },
  { key: 'oldest', labelKey: 'recipes.sortOldest' },
  { key: 'edited_newest', labelKey: 'recipes.sortEditedNewest' },
  { key: 'edited_oldest', labelKey: 'recipes.sortEditedOldest' },
  { key: 'title_asc', labelKey: 'recipes.sortTitleAZ' },
  { key: 'title_desc', labelKey: 'recipes.sortTitleZA' },
]

const RecipesScreen = () => {
  const navigation = useNavigation()
  const router = useRouter()
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
                qc.setQueryData<RecipeOut[]>(['recipes'], (old) =>
                  old?.filter((r) => r.id !== recipe.id) ?? [],
                )
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
        <Pressable
          style={({ pressed }) => [styles.swipeEdit, pressed && { opacity: 0.7 }]}
          onPress={() => {
            swipeableRefs.current.get(item.id)?.close()
            router.push({ pathname: '/recipe/[id]/edit', params: { id: item.id } })
          }}
          accessibilityLabel={t('common.edit')}
          accessibilityRole="button"
        >
          <Text style={styles.swipeActionText}>{t('common.edit')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.swipeDelete, pressed && { opacity: 0.7 }]}
          onPress={() => {
            swipeableRefs.current.get(item.id)?.close()
            handleDelete(item)
          }}
          accessibilityLabel={t('common.delete')}
          accessibilityRole="button"
        >
          <Text style={styles.swipeActionText}>{t('common.delete')}</Text>
        </Pressable>
      </View>
    ),
    [handleDelete, router, t],
  )

  const addMenuActions = useMemo(() => [
    { id: 'url',     title: t('addRecipe.methodUrl'),     image: 'link' },
    { id: 'camera',  title: t('addRecipe.methodCamera'),  image: 'camera' },
    { id: 'gallery', title: t('addRecipe.methodGallery'), image: 'photo' },
    { id: 'text',    title: t('addRecipe.methodText'),    image: 'doc.text' },
    { id: 'scratch', title: t('addRecipe.methodScratch'), image: 'pencil' },
  ], [t])

  const handleAddAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      router.push({ pathname: '/import-recipe', params: { method: nativeEvent.event } })
    },
    [router],
  )

  const filterMenuActions = useMemo(() =>
    SORT_OPTIONS.map((o) => ({
      id: o.key,
      title: t(o.labelKey),
      state: (sort === o.key ? 'on' : 'off') as 'on' | 'off',
    }))
  , [sort, t])

  const handleFilterAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      const sortOption = SORT_OPTIONS.find((o) => o.key === nativeEvent.event)
      if (sortOption) setSort(sortOption.key)
    },
    [],
  )

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('nav.recipes'),
      headerRight: () => (
        <View style={styles.headerBtns}>
          <MenuView
            title={t('addRecipe.addRecipe')}
            actions={addMenuActions}
            onPressAction={handleAddAction}
          >
            <View style={styles.headerBtn}>
              <Feather name="plus" size={26} color={colors.secondaryLabel} />
            </View>
          </MenuView>
          <MenuView
            title={t('recipes.sortBy')}
            actions={filterMenuActions}
            onPressAction={handleFilterAction}
          >
            <View style={styles.headerBtn}>
              <Feather name="sliders" size={22} color={colors.secondaryLabel} />
            </View>
          </MenuView>
          <BellMenu />
        </View>
      ),
    })
  }, [navigation, addMenuActions, handleAddAction, filterMenuActions, handleFilterAction, t])

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
      router.push({ pathname: '/recipe/[id]', params: { id: recipe.id, title: recipe.title } })
    },
    [router],
  )

  const renderTag = useCallback(
    ({ item }: ListRenderItemInfo<Tag>) => {
      const isSelected = item.id === selectedTagId
      return (
        <Pressable
          onPress={() => handleTagPress(item.id)}
          style={({ pressed }) => [styles.chip, isSelected && styles.chipSelected, pressed && { opacity: 0.7 }]}
          accessibilityLabel={item.name}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
        >
          <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
            {tTag(item.name, t)}
          </Text>
        </Pressable>
      )
    },
    [selectedTagId, handleTagPress, t],
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
          <Pressable
            style={({ pressed }) => [styles.card, styles.cardInSwipeable, pressed && { opacity: 0.7 }]}
            onPress={() => handleRecipePress(item)}
            accessibilityLabel={item.title}
            accessibilityRole="button"
          >
            {item.thumbnail_url ? (
              <Image
                source={{ uri: proxyThumbnailUrl(item.thumbnail_url)! }}
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
                  {item.tags.map((tg) => tTag(tg.name, t)).join(', ')}
                </Text>
              )}
              {item.servings != null && (
                <Text style={styles.cardMeta}>
                  {t('recipes.serves')}: {item.servings}
                </Text>
              )}
            </View>
            <Pressable
              style={({ pressed }) => [styles.favBtn, pressed && { opacity: 0.7 }]}
              onPress={() => handleToggleFavourite(item)}
              accessibilityLabel={isFav ? t('recipes.removeFromFavourites') : t('recipes.addToFavourites')}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.favStar, isFav && styles.favStarActive]}>★</Text>
            </Pressable>
          </Pressable>
        </Swipeable>
      )
    },
    [handleRecipePress, handleToggleFavourite, renderSwipeActions, favouriteOverrides, t],
  )

  const favChip = useMemo(
    () => (
      <Pressable
        onPress={() => setFilterFavourites((v) => !v)}
        style={({ pressed }) => [styles.chip, filterFavourites && styles.chipSelected, styles.favChip, pressed && { opacity: 0.7 }]}
        accessibilityLabel={t('recipes.filterFavourites')}
        accessibilityRole="button"
        accessibilityState={{ selected: filterFavourites }}
      >
        <Text style={[styles.chipText, filterFavourites && styles.chipTextSelected]}>
          {'★ '}{t('recipes.filterFavourites')}
        </Text>
      </Pressable>
    ),
    [filterFavourites, t],
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
      </View>
    ),
    [t, query, tags, renderTag, favChip],
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
            <Pressable
              onPress={() => { setSelectedTagId(null); setFilterFavourites(false) }}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              accessibilityLabel={t('recipes.clearFilter')}
              accessibilityRole="button"
            >
              <Text style={styles.clearFilter}>{t('recipes.clearFilter')}</Text>
            </Pressable>
          )}
        </View>
      }
      style={styles.list}
      contentContainerStyle={styles.listContent}
      contentInsetAdjustmentBehavior="automatic"
    />
    </>
  )
}

const styles = StyleSheet.create({
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  headerAddText: {
    fontSize: 26,
    color: colors.brand,
    lineHeight: 30,
    fontWeight: '400',
  },
  list: { flex: 1, backgroundColor: colors.secondaryBackground },
  listContent: { paddingBottom: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: colors.red, fontSize: 16, textAlign: 'center' },
  searchInput: {
    margin: 12,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: colors.background,
  },
  tagList: { marginBottom: 8 },
  tagListContent: { paddingHorizontal: 12, gap: 8 },
  chip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.secondarySystemFill,
  },
  chipSelected: { backgroundColor: colors.blue },
  chipText: { fontSize: 13, color: colors.secondaryLabel },
  chipTextSelected: { color: '#ffffff', fontWeight: '600' },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 10,
    marginHorizontal: 12,
    marginTop: 8,
  },
  cardImage: {
    width: 80,
    height: 80,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  cardImagePlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: colors.opaqueSeparator,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.label, marginBottom: 4 },
  cardTags: { fontSize: 12, color: colors.brand, marginBottom: 2 },
  cardMeta: { fontSize: 12, color: colors.tertiaryLabel },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: {
    fontSize: 16,
    color: colors.secondaryLabel,
    textAlign: 'center',
    marginBottom: 12,
  },
  clearFilter: { fontSize: 16, color: colors.blue, fontWeight: '500' },
  favBtn: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favStar: { fontSize: 20, color: colors.opaqueSeparator },
  favStarActive: { color: '#f59e0b' },
  favChip: { marginRight: 4 },
  swipeContainer: { marginHorizontal: 12, marginTop: 8 },
  cardInSwipeable: { marginHorizontal: 0, marginTop: 0 },
  swipeActions: { flexDirection: 'row' },
  swipeEdit: {
    backgroundColor: colors.brand,
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeDelete: {
    backgroundColor: colors.red,
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  swipeActionText: { color: colors.background, fontSize: 13, fontWeight: '600' },
})

export default RecipesScreen
