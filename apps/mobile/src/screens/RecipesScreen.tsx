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
  View,
} from 'react-native'
import Reanimated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MenuView } from '@react-native-menu/menu'
import { Swipeable } from 'react-native-gesture-handler'
import { useTranslation } from 'react-i18next'
import { useNavigation, useRouter } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRecipes } from '@platekeeper/shared/hooks/useRecipes'
import { useTags } from '@platekeeper/shared/hooks/useTags'
import { useApiClient } from '@platekeeper/shared/api/context'
import { useQueryClient } from '@tanstack/react-query'
import type { RecipeOut, Tag } from '@platekeeper/shared/types'
import { tTag } from '@platekeeper/shared/utils/tagUtils'
import { Feather } from '@expo/vector-icons'
import BellMenu from '../components/BellMenu'
import GlassViewSafe from '../components/GlassViewSafe'
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
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const { recipes, isLoading, error } = useRecipes()
  const { tags } = useTags()
  const api = useApiClient()
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [filterFavourites, setFilterFavourites] = useState(false)
  const [favouriteOverrides, setFavouriteOverrides] = useState<Map<string, boolean>>(new Map())
  const [sort, setSort] = useState<SortMode>('newest')
  const [tagBarHeight, setTagBarHeight] = useState(0)
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map())
  const openSwipeableId = useRef<string | null>(null)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const initialLoadDoneRef = useRef(false)

  // Mark all recipes as "seen" on initial data arrival so they don't animate in.
  // Runs during render (before renderRecipe) so subsequent calls see a populated set.
  if (!isLoading && !initialLoadDoneRef.current) {
    initialLoadDoneRef.current = true
    recipes.forEach((r) => seenIdsRef.current.add(r.id))
  }

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

  const handleSearchChangeText = useCallback(
    (e: { nativeEvent: { text: string } }) => setQuery(e.nativeEvent.text),
    [],
  )
  const handleSearchCancel = useCallback(() => setQuery(''), [])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('nav.recipes'),
      headerSearchBarOptions: {
        placeholder: t('recipes.searchPlaceholder'),
        onChangeText: handleSearchChangeText,
        onCancelButtonPress: handleSearchCancel,
        autoCapitalize: 'none',
      },
      headerRight: () => (
        <View style={styles.headerBtns}>
          <Pressable
            onPress={() => router.push('/import-recipe')}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('nav.addRecipe')}
            accessibilityRole="button"
          >
            <Feather name="plus" size={26} color={colors.secondaryLabel} />
          </Pressable>
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
  }, [navigation, filterMenuActions, handleFilterAction, handleSearchChangeText, handleSearchCancel, t, router])

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
          style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
          accessibilityLabel={item.name}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
        >
          <GlassViewSafe
            style={StyleSheet.absoluteFill}
            glassEffectStyle={isSelected ? 'clear' : 'regular'}
            tintColor={isSelected ? colors.blue : colors.gray5}
          />
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
      const isNew = initialLoadDoneRef.current && !seenIdsRef.current.has(item.id)
      if (isNew) seenIdsRef.current.add(item.id)
      return (
        <Reanimated.View
          entering={isNew ? FadeInDown.springify().damping(20).mass(0.8) : undefined}
          exiting={FadeOut.duration(250)}
          layout={LinearTransition.springify().damping(20)}
        >
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
              <Text
                style={[styles.cardTags, item.tags.length === 0 && styles.cardTagsEmpty]}
                numberOfLines={1}
              >
                {item.tags.length > 0
                  ? item.tags.map((tg) => tTag(tg.name, t)).join(', ')
                  : t('tags.noTags')}
              </Text>
              {(item.servings != null || item.kcal_per_serving != null) && (
                <Text style={styles.cardMeta}>
                  {item.servings != null ? `${t('recipes.serves')}: ${item.servings}` : ''}
                  {item.servings != null && item.kcal_per_serving != null ? '  ·  ' : ''}
                  {item.kcal_per_serving != null ? `${item.kcal_per_serving} kcal` : ''}
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
        </Reanimated.View>
      )
    },
    [handleRecipePress, handleToggleFavourite, renderSwipeActions, favouriteOverrides, t],
  )

  const favChip = useMemo(
    () => (
      <Pressable
        onPress={() => setFilterFavourites((v) => !v)}
        style={({ pressed }) => [styles.chip, styles.favChip, pressed && { opacity: 0.7 }]}
        accessibilityLabel={t('recipes.filterFavourites')}
        accessibilityRole="button"
        accessibilityState={{ selected: filterFavourites }}
      >
        <GlassViewSafe
          style={StyleSheet.absoluteFill}
          glassEffectStyle={filterFavourites ? 'clear' : 'regular'}
          tintColor={filterFavourites ? colors.blue : colors.gray5}
        />
        <Text style={[styles.chipText, filterFavourites && styles.chipTextSelected]}>
          {'★ '}{t('recipes.filterFavourites')}
        </Text>
      </Pressable>
    ),
    [filterFavourites, t],
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
    <View style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderRecipe}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingTop: tagBarHeight, paddingBottom: insets.bottom + 24 }}
        ListFooterComponent={
          filtered.length === 0 ? (
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
          ) : null
        }
      />
      <View
        style={[styles.tagBar, { top: headerHeight }]}
        onLayout={(e) => setTagBarHeight(e.nativeEvent.layout.height)}
      >
        {favChip}
        <View style={styles.tagBarDivider} />
        <FlatList
          data={tags}
          keyExtractor={(t) => t.id}
          renderItem={renderTag}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagScrollArea}
          contentContainerStyle={styles.tagListContent}
        />
      </View>
    </View>
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
  screen: { flex: 1, backgroundColor: colors.secondaryBackground },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: colors.red, fontSize: 16, textAlign: 'center' },
  tagBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: 16,
  },
  tagBarDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: colors.opaqueSeparator,
    marginHorizontal: 8,
  },
  tagScrollArea: { flex: 1 },
  tagListContent: { gap: 8, paddingRight: 16 },
  chip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  chipText: { fontSize: 13, color: colors.secondaryLabel },
  chipTextSelected: { color: '#ffffff', fontWeight: '600' },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 8,
  },
  cardImage: {
    width: 88,
    height: 88,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  cardImagePlaceholder: {
    width: 88,
    height: 88,
    backgroundColor: colors.opaqueSeparator,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.label, marginBottom: 4 },
  cardTags: { fontSize: 12, color: colors.brand, marginBottom: 2, marginTop: 1 },
  cardTagsEmpty: { color: colors.tertiaryLabel },
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
  favChip: { marginLeft: 16 },
  swipeContainer: { marginHorizontal: 16, marginTop: 8 },
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
