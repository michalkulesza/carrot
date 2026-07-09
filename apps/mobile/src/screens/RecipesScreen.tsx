import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ListRenderItemInfo,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import Reanimated, {
  Easing,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { MenuView } from '@react-native-menu/menu'
import { Swipeable } from 'react-native-gesture-handler'
import { useTranslation } from 'react-i18next'
import { useNavigation, useRouter } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import { useTags } from '@carrot/shared/hooks/useTags'
import { useApiClient } from '@carrot/shared/api/context'
import { useQueryClient } from '@tanstack/react-query'
import type { RecipeOut, Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import { Feather } from '@expo/vector-icons'
import BellMenu from '../components/BellMenu'
import BugReportButton from '../components/BugReportButton'
import GlassViewSafe from '../components/GlassViewSafe'
import MarqueeText from '../components/MarqueeText'
import { colors } from '../theme/colors'
import { proxyThumbnailUrl, PLACEHOLDER_URL } from '../api/thumbnailUrl'
import { useNotificationHistory, type NotificationItem } from '../context/NotificationHistoryContext'
import { useScreenLoading } from '../hooks/useScreenLoading'
import { useHousehold } from '../context/HouseholdContext'

const PERSONAL_MENU_ID = '__personal__'
const MANAGE_TIP_MENU_ID = '__manage_tip__'

// The search bar's expanded header height can only be learned from a real focus event
// (see comment near searchBarHeightRef below) — it's a fixed native constant for this
// screen's header configuration, so once measured on this device it's persisted to disk
// and never needs to be (re-)learned again, only on the very first search tap ever.
const SEARCH_BAR_HEIGHT_DELTA_STORAGE_KEY = 'recipes-search-bar-height-delta'
let learnedSearchBarHeightDelta: number | null = null

const ThumbnailImage = ({ url, style }: { url: string; style: object }) => {
  const [errored, setErrored] = useState(false)
  const fallbackUri = PLACEHOLDER_URL || undefined
  if (errored && fallbackUri) {
    return <Image source={{ uri: fallbackUri }} style={style} contentFit="cover" />
  }
  return (
    <Image
      source={{ uri: proxyThumbnailUrl(url)! }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={url}
      onError={() => setErrored(true)}
    />
  )
}

type SortMode = 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'edited_newest' | 'edited_oldest'

const SORT_OPTIONS: { key: SortMode; labelKey: string }[] = [
  { key: 'newest', labelKey: 'recipes.sortNewest' },
  { key: 'oldest', labelKey: 'recipes.sortOldest' },
  { key: 'edited_newest', labelKey: 'recipes.sortEditedNewest' },
  { key: 'edited_oldest', labelKey: 'recipes.sortEditedOldest' },
  { key: 'title_asc', labelKey: 'recipes.sortTitleAZ' },
  { key: 'title_desc', labelKey: 'recipes.sortTitleZA' },
]

const PendingJobCard = ({ notif }: { notif: NotificationItem }) => {
  const { t } = useTranslation()
  const sourceKey = `recipes.extractingFrom_${notif.job_kind ?? 'image'}` as const
  const startedAt = useMemo(() => {
    const d = new Date(notif.timestamp)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }, [notif.timestamp])
  return (
    <View style={styles.pendingCard}>
      <View style={styles.pendingImageWrap}>
        <Feather name="clock" size={28} color={PlatformColor('secondaryLabel') as unknown as string} />
      </View>
      <View style={styles.pendingBody}>
        <Text style={styles.pendingTitle}>{t('recipes.extractingRecipe')}</Text>
        <Text style={styles.pendingMeta}>{t(sourceKey)}  ·  {startedAt}</Text>
      </View>
      <View style={styles.pendingSpinnerWrap}>
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    </View>
  )
}

const RecipesScreen = () => {
  const navigation = useNavigation()
  const router = useRouter()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const headerHeightSV = useSharedValue(headerHeight)
  const tagBarHeightSV = useSharedValue(0)
  const tagBarVisibleSV = useSharedValue(1)
  const collapsedHeaderHeightRef = useRef(headerHeight)
  const searchBarHeightRef = useRef<number | null>(learnedSearchBarHeightDelta)
  const isSearchActiveRef = useRef(false)

  useEffect(() => {
    if (searchBarHeightRef.current != null) return
    AsyncStorage.getItem(SEARCH_BAR_HEIGHT_DELTA_STORAGE_KEY).then((val) => {
      if (val == null || searchBarHeightRef.current != null) return
      const parsed = Number(val)
      if (Number.isFinite(parsed)) {
        searchBarHeightRef.current = parsed
        learnedSearchBarHeightDelta = parsed
      }
    })
  }, [])
  const { recipes, isLoading, isFetching, error } = useRecipes()
  const [switchingHousehold, setSwitchingHousehold] = useState(false)
  const householdFetchStartedRef = useRef(false)
  const { busy, showSpinner } = useScreenLoading(isLoading || switchingHousehold)
  const { tags } = useTags()
  const { households, activeHouseholdId, activeHousehold, switchHousehold } = useHousehold()
  const api = useApiClient()
  const qc = useQueryClient()
  const { items: notifItems } = useNotificationHistory()
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [filterFavourites, setFilterFavourites] = useState(false)
  const [favouriteOverrides, setFavouriteOverrides] = useState<Map<string, boolean>>(new Map())
  const [sort, setSort] = useState<SortMode>('newest')
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
            router.push({ pathname: '/recipe/[id]', params: { id: item.id, edit: '1' } })
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

  const householdMenuActions = useMemo(
    () => [
      {
        id: PERSONAL_MENU_ID,
        title: t('households.personal'),
        state: 'off' as const,
        image: activeHouseholdId === null ? 'checkmark.circle.fill' : 'circle',
        // Must be a plain hex string, not colors.secondaryLabel (PlatformColor) — passing a
        // PlatformColor object as imageColor here silently breaks the whole menu from opening.
        imageColor: '#8e8e93',
      },
      ...households.map((h) => ({
        id: h.id,
        title: h.name,
        state: 'off' as const,
        image: h.id === activeHouseholdId ? 'checkmark.circle.fill' : 'circle.fill',
        imageColor: h.color,
      })),
      ...(households.length === 0
        ? [
            {
              id: MANAGE_TIP_MENU_ID,
              title: t('households.manageTipTitle'),
              subtitle: t('households.manageTip'),
              attributes: { disabled: true },
            },
          ]
        : []),
    ],
    [households, activeHouseholdId, t],
  )

  const handleHouseholdAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      if (nativeEvent.event === MANAGE_TIP_MENU_ID) return
      const id = nativeEvent.event === PERSONAL_MENU_ID ? null : nativeEvent.event
      if (id !== activeHouseholdId) {
        setSwitchingHousehold(true)
        householdFetchStartedRef.current = false
        switchHousehold(id).catch(() => setSwitchingHousehold(false))
      }
    },
    [activeHouseholdId, switchHousehold],
  )

  // switchHousehold only awaits the API call + user refresh — the recipes query
  // invalidation happens afterwards, asynchronously, in HouseholdContext. Keep the
  // spinner up until that refetch actually starts and then finishes, so we don't
  // clear it during the gap before isFetching flips true.
  useEffect(() => {
    if (!switchingHousehold) return
    if (isFetching) {
      householdFetchStartedRef.current = true
      return
    }
    if (householdFetchStartedRef.current) {
      householdFetchStartedRef.current = false
      setSwitchingHousehold(false)
    }
  }, [isFetching, switchingHousehold])

  const handleSearchChangeText = useCallback(
    (e: { nativeEvent: { text: string } }) => setQuery(e.nativeEvent.text),
    [],
  )
  const handleSearchCancel = useCallback(() => setQuery(''), [])

  // useHeaderHeight() only reports the search bar's expanded height once UIKit's own
  // reveal animation has already finished, so animating off of it lags a full cycle
  // behind the native motion. Instead, kick our animation off directly from onFocus/onBlur
  // (which fire as the native animation starts) towards a learned expanded height, and use
  // the headerHeight effect only to calibrate that height for next time.
  useEffect(() => {
    // All user-visible motion is driven by animateHeaderHeight() from onFocus/onBlur —
    // this effect only calibrates/corrects, so it snaps instantly rather than running a
    // second, separately-timed animation (which reads as a laggy "catch up").
    if (isSearchActiveRef.current) {
      const delta = headerHeight - collapsedHeaderHeightRef.current
      if (delta !== searchBarHeightRef.current) {
        searchBarHeightRef.current = delta
        learnedSearchBarHeightDelta = delta
        void AsyncStorage.setItem(SEARCH_BAR_HEIGHT_DELTA_STORAGE_KEY, String(delta))
      }
    } else {
      collapsedHeaderHeightRef.current = headerHeight
    }
    headerHeightSV.value = headerHeight
  }, [headerHeight, headerHeightSV])

  const animateHeaderHeight = useCallback(
    (active: boolean) => {
      isSearchActiveRef.current = active
      if (active && searchBarHeightRef.current == null) return // unknown height yet — effect above will animate once the real value lands
      const target = active
        ? collapsedHeaderHeightRef.current + (searchBarHeightRef.current ?? 0)
        : collapsedHeaderHeightRef.current
      headerHeightSV.value = withTiming(target, { duration: 300, easing: Easing.out(Easing.cubic) })
    },
    [headerHeightSV],
  )
  const handleSearchFocus = useCallback(() => {
    // Kick the animation off before any setState — clearing the tag/favourites filters
    // below triggers a re-render of the (possibly long) recipe list, and letting that run
    // first delays the shared-value mutation reaching the UI thread, which reads as the
    // tag bar fading late instead of immediately on tap.
    tagBarVisibleSV.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) })
    animateHeaderHeight(true)
    setIsSearching(true)
    setSelectedTagId(null)
    setFilterFavourites(false)
  }, [animateHeaderHeight, tagBarVisibleSV])
  const handleSearchBlur = useCallback(() => {
    tagBarVisibleSV.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
    animateHeaderHeight(false)
    setIsSearching(false)
  }, [animateHeaderHeight, tagBarVisibleSV])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('nav.recipes'),
      headerTitle: () => (
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitleText} numberOfLines={1}>
            {t('nav.recipes')}
          </Text>
          <MenuView
            title={t('households.switchContext')}
            actions={householdMenuActions}
            onPressAction={handleHouseholdAction}
          >
            <View style={styles.householdSwitcher}>
              <View
                style={[
                  styles.householdDot,
                  activeHousehold?.color
                    ? { backgroundColor: activeHousehold.color }
                    : styles.householdDotEmpty,
                ]}
              />
              <Text style={styles.householdSwitcherText} numberOfLines={1}>
                {activeHousehold ? activeHousehold.name : t('households.personal')}
              </Text>
              <Feather name="chevron-down" size={13} color={colors.secondaryLabel} />
            </View>
          </MenuView>
        </View>
      ),
      headerSearchBarOptions: {
        placeholder: t('recipes.searchPlaceholder'),
        onChangeText: handleSearchChangeText,
        onCancelButtonPress: handleSearchCancel,
        onFocus: handleSearchFocus,
        onBlur: handleSearchBlur,
        autoCapitalize: 'none',
      },
      headerRight: () => (
        <View style={styles.headerBtns}>
          <Pressable
            onPress={() => router.push('/import-recipe')}
            style={({ pressed }) => [styles.headerBtn, styles.addBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('nav.addRecipe')}
            accessibilityRole="button"
          >
            <Feather name="plus" size={20} color="white" />
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
          <BugReportButton />
          <BellMenu />
        </View>
      ),
    })
  }, [
    navigation,
    filterMenuActions,
    handleFilterAction,
    householdMenuActions,
    handleHouseholdAction,
    activeHousehold,
    handleSearchChangeText,
    handleSearchCancel,
    handleSearchFocus,
    handleSearchBlur,
    t,
    router,
  ])

  const recipesWithOverrides = useMemo(
    () =>
      recipes.map((r) => ({
        ...r,
        is_favourite: favouriteOverrides.has(r.id) ? favouriteOverrides.get(r.id)! : r.is_favourite,
      })),
    [recipes, favouriteOverrides],
  )

  const pendingJobs = useMemo(
    () => notifItems.filter((n) => n.type === 'recipe_importing'),
    [notifItems],
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
          entering={isNew ? FadeInDown.duration(250) : undefined}
          exiting={FadeOut.duration(250)}
          layout={LinearTransition.duration(250)}
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
              <ThumbnailImage url={item.thumbnail_url} style={styles.cardImage} />
            ) : (
              <View style={styles.cardImagePlaceholder} />
            )}
            <View style={styles.cardBody}>
              <MarqueeText text={item.title} style={styles.cardTitle} containerStyle={styles.cardTitleMarquee} />
              {item.tags.length > 0 ? (
                <View style={styles.cardTagRow}>
                  {item.tags.map((tg) => (
                    <View key={tg.id} style={styles.cardTagPill}>
                      <Text style={styles.cardTagPillText} numberOfLines={1}>
                        {tTag(tg.name, t)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.cardTags, styles.cardTagsEmpty]}>{t('tags.noTags')}</Text>
              )}
              {(item.servings != null || item.kcal_per_serving != null || item.protein_per_serving != null || item.fat_per_serving != null || item.carbs_per_serving != null) && (
                <Text style={styles.cardMeta}>
                  {[
                    item.servings != null ? `${t('recipes.serves')}: ${item.servings}` : null,
                    item.kcal_per_serving != null ? `${item.kcal_per_serving} kcal` : null,
                    item.protein_per_serving != null ? `${item.protein_per_serving}g ${t('recipes.protein')}` : null,
                    item.fat_per_serving != null ? `${item.fat_per_serving}g ${t('recipes.fat')}` : null,
                    item.carbs_per_serving != null ? `${item.carbs_per_serving}g ${t('recipes.carbs')}` : null,
                  ].filter(Boolean).join('   ')}
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

  const tagBarPositionStyle = useAnimatedStyle(() => ({
    top: headerHeightSV.value,
    opacity: tagBarVisibleSV.value,
  }))
  const topSpacerStyle = useAnimatedStyle(() => ({
    height: headerHeightSV.value + tagBarHeightSV.value * tagBarVisibleSV.value,
  }))

  if (busy) {
    // Only draw our own spinner once auth is ready — during auth bootstrap the
    // root loadingOverlay in app/_layout.tsx is the single loader.
    return (
      <View style={styles.center}>
        {showSpinner && <ActivityIndicator size="large" accessibilityLabel={t('common.loading')} />}
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
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View>
            <Reanimated.View style={topSpacerStyle} />
            {pendingJobs.length > 0 && (
              <View>
                {pendingJobs.map((notif) => (
                  <PendingJobCard key={notif.id} notif={notif} />
                ))}
              </View>
            )}
          </View>
        }
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
      <Reanimated.View
        style={[styles.tagBar, tagBarPositionStyle]}
        onLayout={(e) => { tagBarHeightSV.value = e.nativeEvent.layout.height }}
        pointerEvents={isSearching ? 'none' : 'auto'}
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
      </Reanimated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  headerTitleWrap: { flexDirection: 'column', alignItems: 'flex-start' },
  headerTitleText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.label,
  },
  householdSwitcher: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  householdDot: { width: 8, height: 8, borderRadius: 4 },
  householdDotEmpty: {
    borderWidth: 1.5,
    borderColor: colors.secondaryLabel,
  },
  householdSwitcherText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    color: colors.secondaryLabel,
  },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    width: 100,
    height: 100,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  cardImagePlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: colors.opaqueSeparator,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: colors.label },
  cardTitleMarquee: { marginBottom: 4 },
  cardTags: { fontSize: 12, color: colors.brand, marginBottom: 2, marginTop: 1 },
  cardTagsEmpty: { color: colors.tertiaryLabel },
  cardTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 2, marginTop: 1 },
  cardTagPill: {
    backgroundColor: colors.brandLight,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  cardTagPillText: { fontSize: 12, lineHeight: 16, color: colors.brand, fontWeight: '500' },
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
  pendingCard: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 8,
    opacity: 0.85,
  },
  pendingImageWrap: {
    width: 100,
    height: 100,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    backgroundColor: colors.opaqueSeparator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBody: { flex: 1, padding: 12, justifyContent: 'center' },
  pendingTitle: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: colors.label, marginBottom: 4 },
  pendingMeta: { fontSize: 12, color: colors.tertiaryLabel },
  pendingSpinnerWrap: { width: 40, alignItems: 'center', justifyContent: 'center' },
})

export default RecipesScreen
