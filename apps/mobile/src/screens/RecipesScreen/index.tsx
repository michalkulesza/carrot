import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  type LayoutChangeEvent,
  Linking,
  ListRenderItemInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Reanimated, {
  Easing,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import type { NativeActionEvent } from '@react-native-menu/menu'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useIsFocused, useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { useRecipes, useSemanticRecipeSearch } from '@carrot/shared/hooks/useRecipes'
import { useImportJobs } from '@carrot/shared/hooks/useImportJobs'
import { useTags } from '@carrot/shared/hooks/useTags'
import { useApiClient } from '@carrot/shared/api/context'
import { useQueryClient } from '@tanstack/react-query'
import type { ImportJob, RecipeOut, Tag } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import Avatar from '../../components/Avatar'
import { TAG_CATEGORIES, groupTagsByCategory, matchesTagFilters } from '@carrot/shared/utils/tagFilters'
import CategoryFilterChip from './CategoryFilterChip'
import MarqueeText from '../../components/MarqueeText'
import MarqueeRow from '../../components/MarqueeRow'
import { MarqueeSyncProvider, MarqueeSyncSlots } from '../../components/MarqueeSync'
import { colors } from '../../theme/colors'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { useHousehold } from '../../context/HouseholdContext'
import { useAuth } from '../../context/AuthContext'
import { SORT_OPTIONS, type SortMode } from './helpers'
import { TOGGLE_HOUSEHOLD_PREFIX } from '../RecipeDetailScreen/useRecipeDetailHeader'
import { styles } from './styles'
import ThumbnailImage from './ThumbnailImage'
import PendingJobCard from './PendingJobCard'
import HeaderTitle from './HeaderTitle'
import HeaderRight from './HeaderRight'
import FloatingAddButton from './FloatingAddButton'
import NextMealCard from './NextMealCard'
import AddRecipeDrawer, { type AddRecipeDrawerHandle } from '../../components/AddRecipeDrawer'

type RecipeListItem =
  | { type: 'import-job'; job: ImportJob }
  | { type: 'semantic-header' }
  | { type: 'recipe'; recipe: RecipeOut }

const SEARCH_TRANSITION = { duration: 300, easing: Easing.out(Easing.cubic) }

interface RecipeSearchFooterProps {
  filterFavourites: boolean
  hasSearchQuery: boolean
  isSemanticLoading: boolean
  recipeCount: number
  selectedTagCount: number
  onClearFilters: () => void
  onAddRecipe: () => void
}

const RecipeSearchFooter = ({
  filterFavourites,
  hasSearchQuery,
  isSemanticLoading,
  recipeCount,
  selectedTagCount,
  onClearFilters,
  onAddRecipe,
}: RecipeSearchFooterProps) => {
  const { t } = useTranslation()

  if (isSemanticLoading) {
    return (
      <View style={styles.searchLoading} accessibilityLiveRegion="polite">
        <ActivityIndicator accessibilityLabel={t('recipes.semanticSearchLoading')} />
        <Text style={styles.searchLoadingText}>{t('recipes.semanticSearchLoading')}</Text>
      </View>
    )
  }

  if (recipeCount > 0) return null

  const isTrulyEmpty = !hasSearchQuery && !filterFavourites && selectedTagCount === 0
  const emptyLabel = hasSearchQuery
    ? t('recipes.noResults')
    : filterFavourites
    ? t('recipes.noFavourites')
    : selectedTagCount > 0
    ? t('recipes.noRecipesWithTag')
    : t('recipes.addFirstRecipe')
  const canClearFilters = selectedTagCount > 0 || filterFavourites

  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{emptyLabel}</Text>
      {isTrulyEmpty && <Text style={styles.emptySubtitle}>{t('recipes.addPrompt')}</Text>}
      {canClearFilters && (
        <Pressable
          onPress={onClearFilters}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          accessibilityLabel={t('recipes.clearFilter')}
          accessibilityRole="button"
        >
          <Text style={styles.clearFilter}>{t('recipes.clearFilter')}</Text>
        </Pressable>
      )}
      {isTrulyEmpty && (
        <Pressable
          onPress={onAddRecipe}
          style={({ pressed }) => [styles.addRecipeButton, pressed && { opacity: 0.8 }]}
          accessibilityLabel={t('recipes.addARecipe')}
          accessibilityRole="button"
        >
          <Text style={styles.addRecipeButtonText}>{t('recipes.addARecipe')}</Text>
        </Pressable>
      )}
    </View>
  )
}

const RecipesScreen = () => {
  const navigation = useNavigation()
  const router = useRouter()
  const isFocused = useIsFocused()
  const { openAddRecipe } = useLocalSearchParams<{ openAddRecipe?: string }>()
  const addRecipeSheetRef = useRef<AddRecipeDrawerHandle>(null)
  const { t } = useTranslation()
  const searchProgress = useSharedValue(0)
  const headerChromeHeightSV = useSharedValue(0)

  useEffect(() => {
    if (openAddRecipe !== '1') return
    addRecipeSheetRef.current?.present()
    router.setParams({ openAddRecipe: undefined })
  }, [openAddRecipe, router])

  const { user, loading: authLoading } = useAuth()
  const { households, isLoadingHouseholds, activeHouseholdId, activeHousehold, switchHousehold } = useHousehold()
  const dataQueriesEnabled = !authLoading && user !== null && !isLoadingHouseholds && activeHouseholdId != null
  const { recipes, isLoading, isFetching, error } = useRecipes(dataQueriesEnabled)
  const [switchingHousehold, setSwitchingHousehold] = useState(false)
  const householdFetchStartedRef = useRef(false)
  const { busy, showSpinner } = useScreenLoading(isLoading || switchingHousehold)
  const { tags } = useTags()
  const api = useApiClient()
  const qc = useQueryClient()
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [filterFavourites, setFilterFavourites] = useState(false)
  const [favouriteOverrides, setFavouriteOverrides] = useState<Map<string, boolean>>(new Map())
  const [sort, setSort] = useState<SortMode>('newest')
  const { semanticRecipes, isSemanticLoading } = useSemanticRecipeSearch(
    query,
    user ? `${user.id}:${activeHouseholdId ?? 'personal'}` : null,
  )
  const seenIdsRef = useRef<Set<string>>(new Set())
  const initialLoadDoneRef = useRef(false)
  const knownRecipeIdsRef = useRef<Set<string>>(new Set())
  const recipeIdsInitializedRef = useRef(false)

  // Mark all recipes as "seen" on initial data arrival so they don't animate in.
  // Runs during render (before renderRecipe) so subsequent calls see a populated set.
  if (!isLoading && !initialLoadDoneRef.current) {
    initialLoadDoneRef.current = true
    recipes.forEach((r) => seenIdsRef.current.add(r.id))
  }

  useEffect(() => {
    if (isLoading) return

    const recipeIds = new Set(recipes.map((recipe) => recipe.id))
    if (!recipeIdsInitializedRef.current || switchingHousehold) {
      recipeIdsInitializedRef.current = true
      knownRecipeIdsRef.current = recipeIds

      return
    }

    if (!isFocused) return

    const hasNewRecipe = recipes.some((recipe) => !knownRecipeIdsRef.current.has(recipe.id))
    knownRecipeIdsRef.current = recipeIds
    if (hasNewRecipe) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    }
  }, [isFocused, isLoading, recipes, switchingHousehold])

  const handleConfirmDelete = useCallback(
    async (recipe: RecipeOut) => {
      try {
        await api.deleteRecipe(recipe.id)
        qc.setQueryData<RecipeOut[]>(['recipes'], (old) => old?.filter((r) => r.id !== recipe.id) ?? [])
        await qc.invalidateQueries({ queryKey: ['recipes'] })
      } catch {
        Alert.alert(t('recipes.failedToDelete'))
      }
    },
    [api, qc, t],
  )

  const handleConfirmRemoveFromHousehold = useCallback(
    async (recipe: RecipeOut) => {
      if (!activeHouseholdId) return
      try {
        await api.removeRecipeFromHousehold(recipe.id, activeHouseholdId)
        qc.setQueryData<RecipeOut[]>(['recipes'], (old) => old?.filter((r) => r.id !== recipe.id) ?? [])
        await qc.invalidateQueries({ queryKey: ['recipes'] })
      } catch {
        Alert.alert(t('recipes.failedToDelete'))
      }
    },
    [api, qc, activeHouseholdId, t],
  )

  const handleDelete = useCallback(
    (recipe: RecipeOut) => {
      const isAuthor = recipe.author_id === user?.id
      const linkedToActiveHousehold =
        !!activeHouseholdId && recipe.household_ids.includes(activeHouseholdId)

      const buttons: Parameters<typeof Alert.alert>[2] = [
        { text: t('common.cancel'), style: 'cancel' },
      ]
      if (linkedToActiveHousehold && activeHousehold) {
        buttons.push({
          text: t('recipes.deleteFromHousehold', { name: activeHousehold.name }),
          style: 'destructive',
          onPress: () => handleConfirmRemoveFromHousehold(recipe),
        })
      }
      if (isAuthor) {
        buttons.push({
          text: t('recipes.deleteEverywhere'),
          style: 'destructive',
          onPress: () => handleConfirmDelete(recipe),
        })
      }

      Alert.alert(t('recipes.deleteTitle'), t('recipes.deleteConfirm', { title: recipe.title }), buttons)
    },
    [handleConfirmDelete, handleConfirmRemoveFromHousehold, user, activeHouseholdId, activeHousehold, t],
  )

  const buildRecipeShareActions = useCallback(
    (item: RecipeOut): { id: string; label: string }[] =>
      households.map((h) => ({
        id: `${TOGGLE_HOUSEHOLD_PREFIX}${h.id}`,
        label: item.household_ids.includes(h.id)
          ? t('recipes.deleteFromHousehold', { name: h.name })
          : `${t('recipes.addToHousehold')}: ${h.name}`,
      })),
    [households, t],
  )

  const filterMenuActions = useMemo(() =>
    SORT_OPTIONS.map((o) => ({
      id: o.key,
      title: t(o.labelKey),
      state: (sort === o.key ? 'on' : 'off') as 'on' | 'off',
    }))
  , [sort, t])

  const handleFilterAction = useCallback(
    ({ nativeEvent }: NativeActionEvent) => {
      const sortOption = SORT_OPTIONS.find((o) => o.key === nativeEvent.event)
      if (sortOption) setSort(sortOption.key)
    },
    [],
  )

  const householdMenuActions = useMemo(
    () =>
      households.map((h) => ({
        id: h.id,
        title: h.name,
        state: 'off' as const,
        image: h.id === activeHouseholdId ? 'checkmark.circle.fill' : 'circle.fill',
        imageColor: h.color,
      })),
    [households, activeHouseholdId],
  )

  const handleHouseholdAction = useCallback(
    ({ nativeEvent }: NativeActionEvent) => {
      const id = nativeEvent.event
      if (id !== activeHouseholdId) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        setSwitchingHousehold(true)
        householdFetchStartedRef.current = false
        switchHousehold(id).catch(() => setSwitchingHousehold(false))
      }
    },
    [activeHouseholdId, switchHousehold],
  )

  const handleHouseholdMenuOpen = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }, [])

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
  const handleSearchCancel = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setQuery('')
  }, [])

  const handleSearchFocus = useCallback(() => {
    // Kick the animation off before any setState — clearing the tag/favourites filters
    // below triggers a re-render of the (possibly long) recipe list, and letting that run
    // first delays the shared-value mutation reaching the UI thread, which reads as the
    // tag bar fading late instead of immediately on tap.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    searchProgress.value = withTiming(1, SEARCH_TRANSITION)
    setIsSearching(true)
    if (selectedTagIds.size > 0) setSelectedTagIds(new Set())
    if (filterFavourites) setFilterFavourites(false)
  }, [filterFavourites, searchProgress, selectedTagIds])
  const handleSearchBlur = useCallback(() => {
    searchProgress.value = withTiming(0, SEARCH_TRANSITION)
    setIsSearching(false)
  }, [searchProgress])

  const recipesTitle = t('nav.recipes')
  const switchContextLabel = t('households.switchContext')
  const sortByLabel = t('recipes.sortBy')
  const renderHeaderTitle = useCallback(
    () => (
      <HeaderTitle
        title={recipesTitle}
        householdMenuActions={householdMenuActions}
        onHouseholdAction={handleHouseholdAction}
        onHouseholdMenuOpen={handleHouseholdMenuOpen}
        activeHousehold={activeHousehold}
        switchContextLabel={switchContextLabel}
        isLoadingHouseholds={isLoadingHouseholds}
      />
    ),
    [
      activeHousehold,
      handleHouseholdAction,
      handleHouseholdMenuOpen,
      householdMenuActions,
      isLoadingHouseholds,
      recipesTitle,
      switchContextLabel,
    ],
  )
  const renderHeaderRight = useCallback(
    () => (
      <HeaderRight
        sortByLabel={sortByLabel}
        filterMenuActions={filterMenuActions}
        onFilterAction={handleFilterAction}
      />
    ),
    [filterMenuActions, handleFilterAction, sortByLabel],
  )
  const headerSearchBarOptions = useMemo(
    () => ({
      placeholder: t('recipes.searchPlaceholder'),
      onChangeText: handleSearchChangeText,
      onCancelButtonPress: handleSearchCancel,
      onFocus: handleSearchFocus,
      onBlur: handleSearchBlur,
      hideWhenScrolling: false,
      autoCapitalize: 'none' as const,
    }),
    [handleSearchBlur, handleSearchCancel, handleSearchChangeText, handleSearchFocus, t],
  )

  useLayoutEffect(() => {
    const headerOptions = {
      title: recipesTitle,
      headerTitle: renderHeaderTitle,
      headerSearchBarOptions,
      headerRight: renderHeaderRight,
    }

    navigation.setOptions(headerOptions)
  }, [
    headerSearchBarOptions,
    navigation,
    recipesTitle,
    renderHeaderRight,
    renderHeaderTitle,
  ])

  const recipesWithOverrides = useMemo(
    () =>
      recipes.map((r) => ({
        ...r,
        is_favourite: favouriteOverrides.has(r.id) ? favouriteOverrides.get(r.id)! : r.is_favourite,
      })),
    [recipes, favouriteOverrides],
  )

  const { jobs: importJobs, retry, cancel, dismiss } = useImportJobs(
    user ? `${user.id}:${activeHouseholdId ?? 'personal'}` : null,
  )
  const pendingJobs = useMemo(
    () => importJobs,
    [importJobs],
  )
  const showImportJobs = !query.trim() && !filterFavourites && selectedTagIds.size === 0
  const hasSearchQuery = query.trim().length > 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sortRecipes = (items: RecipeOut[]) => [...items].sort((a, b) => {
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
    const matchesActiveFilters = (r: RecipeOut) => {
      const matchesTag = matchesTagFilters(r.tags, tags, selectedTagIds)
      const matchesFav = !filterFavourites || r.is_favourite
      return matchesTag && matchesFav
    }
    const literalMatches = recipesWithOverrides.filter((r) => {
      const matchesQuery = !q || r.title.toLowerCase().includes(q)
      return matchesQuery && matchesActiveFilters(r)
    })
    if (!q) return sortRecipes(literalMatches)

    const literalIds = new Set(literalMatches.map((recipe) => recipe.id))
    const semanticMatches = semanticRecipes
      .map((recipe) => ({
        ...recipe,
        is_favourite: favouriteOverrides.has(recipe.id) ? favouriteOverrides.get(recipe.id)! : recipe.is_favourite,
      }))
      .filter((recipe) => !literalIds.has(recipe.id) && matchesActiveFilters(recipe))
    return [...sortRecipes(literalMatches), ...semanticMatches]
  }, [recipesWithOverrides, query, tags, selectedTagIds, filterFavourites, sort, semanticRecipes, favouriteOverrides])

  // Keep import placeholders and recipes in one list. When an import completes,
  // the cache update replaces the job item with its newly created recipe instead
  // of briefly displaying both in separate list sections.
  const recipeListItems = useMemo<RecipeListItem[]>(
    () => {
      const normalizedQuery = query.trim().toLowerCase()
      const literalIds = new Set(
        recipesWithOverrides
          .filter((recipe) => normalizedQuery && recipe.title.toLowerCase().includes(normalizedQuery))
          .map((recipe) => recipe.id),
      )
      const firstSemanticIndex = normalizedQuery
        ? filtered.findIndex((recipe) => !literalIds.has(recipe.id))
        : -1
      const recipeItems = filtered.flatMap((recipe, index) => [
        ...(index === firstSemanticIndex ? [{ type: 'semantic-header' as const }] : []),
        { type: 'recipe' as const, recipe },
      ])
      return [
        ...(showImportJobs ? pendingJobs.map((job) => ({ type: 'import-job' as const, job })) : []),
        ...recipeItems,
      ]
    },
    [filtered, pendingJobs, query, recipesWithOverrides, showImportJobs],
  )

  const toggleTagId = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }, [])

  const handleClearFilters = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setSelectedTagIds(new Set())
    setFilterFavourites(false)
  }, [])

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
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      router.push({ pathname: '/recipe/[id]', params: { id: recipe.id, title: recipe.title } })
    },
    [router],
  )

  const handleShareAction = useCallback(
    async (item: RecipeOut, shareId: string) => {
      const householdId = shareId.slice(TOGGLE_HOUSEHOLD_PREFIX.length)
      try {
        if (item.household_ids.includes(householdId)) {
          await api.removeRecipeFromHousehold(item.id, householdId)
        } else {
          await api.setRecipeHouseholds(item.id, [...item.household_ids, householdId])
        }
        await qc.invalidateQueries({ queryKey: ['recipes'] })
      } catch (err) {
        Alert.alert(t('common.somethingWentWrong'), err instanceof Error ? err.message : t('addRecipe.failedToAdd'))
      }
    },
    [api, qc, t],
  )

  const handleRecipeLongPress = useCallback(
    (item: RecipeOut) => {
      const isFav = favouriteOverrides.has(item.id) ? favouriteOverrides.get(item.id)! : item.is_favourite
      const shareActions = buildRecipeShareActions(item)
      const favouriteLabel = isFav ? t('recipes.removeFromFavourites') : t('recipes.addToFavourites')
      const labels = [favouriteLabel, t('common.edit'), ...shareActions.map((a) => a.label), t('common.delete')]
      const deleteIndex = labels.length - 1
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...labels, t('common.cancel')],
          destructiveButtonIndex: deleteIndex,
          cancelButtonIndex: labels.length,
        },
        (index) => {
          if (index === 0) {
            handleToggleFavourite(item)
            return
          }
          if (index === 1) {
            router.push({ pathname: '/recipe/[id]', params: { id: item.id, edit: '1' } })
            return
          }
          if (index === deleteIndex) {
            handleDelete(item)
            return
          }
          const share = shareActions[index - 2]
          if (share) handleShareAction(item, share.id)
        },
      )
    },
    [buildRecipeShareActions, favouriteOverrides, handleToggleFavourite, router, handleDelete, handleShareAction, t],
  )

  const renderTag = useCallback(
    (item: Tag) => {
      const isSelected = selectedTagIds.has(item.id)
      return (
        <Pressable
          key={item.id}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            toggleTagId(item.id)
          }}
          style={({ pressed }) => [styles.chip, isSelected && styles.chipActive, pressed && { opacity: 0.7 }]}
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
    [selectedTagIds, toggleTagId, t],
  )

  const recipeHouseholdAvatars = useCallback(
    (recipe: RecipeOut) =>
      recipe.household_ids
        .map((id) => households.find((candidate) => candidate.id === id))
        .filter((h): h is NonNullable<typeof h> => !!h)
        .map((h) => ({ key: h.id, name: h.name, color: h.color })),
    [households],
  )

  const renderRecipe = useCallback(
    ({ item }: { item: RecipeOut }) => {
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
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            onPress={() => handleRecipePress(item)}
            onLongPress={() => handleRecipeLongPress(item)}
            accessibilityLabel={item.title}
            accessibilityRole="button"
          >
            <ThumbnailImage url={item.thumbnail_url} style={styles.cardImage} />
            <View style={styles.cardBody}>
              <MarqueeSyncSlots>
                {({ title: titleTurn, tags: tagsTurn }) => (
                  <>
                    <MarqueeText
                      text={item.title}
                      style={styles.cardTitle}
                      containerStyle={styles.cardTitleMarquee}
                      turn={titleTurn.turn}
                      onOverflowChange={titleTurn.onOverflowChange}
                      onDone={titleTurn.onDone}
                    />
                    {item.tags.length > 0 ? (
                      <MarqueeRow
                        containerStyle={styles.cardTagRow}
                        gap={4}
                        turn={tagsTurn.turn}
                        onOverflowChange={tagsTurn.onOverflowChange}
                        onDone={tagsTurn.onDone}
                      >
                        {item.tags.map((tg) => (
                          <View key={tg.id} style={styles.cardTagPill}>
                            <Text style={styles.cardTagPillText} numberOfLines={1}>
                              {tTag(tg.name, t)}
                            </Text>
                          </View>
                        ))}
                      </MarqueeRow>
                    ) : (
                      <Text style={[styles.cardTags, styles.cardTagsEmpty]}>{t('tags.noTags')}</Text>
                    )}
                  </>
                )}
              </MarqueeSyncSlots>
              <View style={styles.cardMetaRow}>
                <View style={styles.cardHouseholdAvatars}>
                  {recipeHouseholdAvatars(item).map(({ key, ...avatarProps }) => (
                    <Avatar key={key} {...avatarProps} size={18} />
                  ))}
                </View>
                {item.kcal_per_serving != null && (
                  <Text style={styles.cardMeta}>{`${item.kcal_per_serving} kcal`}</Text>
                )}
              </View>
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
        </Reanimated.View>
      )
    },
    [
      handleRecipePress,
      handleRecipeLongPress,
      handleToggleFavourite,
      favouriteOverrides,
      recipeHouseholdAvatars,
      t,
    ],
  )

  const renderRecipeListItem = useCallback(
    ({ item }: ListRenderItemInfo<RecipeListItem>) => {
      if (item.type === 'recipe') return renderRecipe({ item: item.recipe })
      if (item.type === 'semantic-header') {
        return <Text style={styles.semanticHeader}>{t('recipes.sectionSuggested')}</Text>
      }

      return (
        <PendingJobCard
          job={item.job}
          onRetry={() => retry.mutateAsync(item.job.id)}
          onCancel={() => cancel.mutateAsync(item.job.id)}
          onDismiss={() => dismiss.mutateAsync(item.job.id)}
          onContinueManually={() => {
            addRecipeSheetRef.current?.presentTextImport()
            if (item.job.source_url) void Linking.openURL(item.job.source_url)
          }}
        />
      )
    },
    [cancel, dismiss, renderRecipe, retry, t],
  )

  const favChip = useMemo(
    () => (
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          setFilterFavourites((v) => !v)
        }}
        style={({ pressed }) => [styles.favChip, filterFavourites && styles.chipActive, pressed && { opacity: 0.7 }]}
        accessibilityLabel={t('recipes.filterFavourites')}
        accessibilityRole="button"
        accessibilityState={{ selected: filterFavourites }}
      >
        <Text style={[styles.favChipText, filterFavourites && styles.chipTextSelected]}>★</Text>
      </Pressable>
    ),
    [filterFavourites, t],
  )

  const groupedFilterTags = useMemo(() => groupTagsByCategory(tags), [tags])

  const headerChromeStyle = useAnimatedStyle(() => ({
    marginTop: -headerChromeHeightSV.value * searchProgress.value,
    opacity: 1 - searchProgress.value,
  }))
  const handleHeaderChromeLayout = useCallback(
    (event: LayoutChangeEvent) => {
      headerChromeHeightSV.value = event.nativeEvent.layout.height
    },
    [headerChromeHeightSV],
  )

  if (busy) {
    // Only draw our own spinner once auth is ready — during auth bootstrap the
    // root loadingOverlay in app/_layout.tsx is the single loader.
    return (
      <View style={styles.center}>
        {showSpinner && <ActivityIndicator size="large" accessibilityLabel={t('common.loading')} />}
      </View>
    )
  }

  if (error && !isFetching) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error.message}</Text>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <MarqueeSyncProvider>
        <FlatList
          data={recipeListItems}
          keyExtractor={(item) => {
            if (item.type === 'recipe') return item.recipe.id
            if (item.type === 'semantic-header') return 'semantic-header'
            return `import-job-${item.job.id}`
          }}
          renderItem={renderRecipeListItem}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: 88 }}
          ListHeaderComponent={
            <Reanimated.View
              style={headerChromeStyle}
              onLayout={handleHeaderChromeLayout}
              pointerEvents={isSearching ? 'none' : 'auto'}
            >
              <View style={styles.tagBar}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tagListContent}
                >
                  {favChip}
                  {TAG_CATEGORIES.map((category) => (
                    <CategoryFilterChip
                      key={category}
                      category={category}
                      tags={groupedFilterTags[category]}
                      selectedTagIds={selectedTagIds}
                      onToggle={toggleTagId}
                    />
                  ))}
                  {groupedFilterTags.other.length > 0 && <View style={styles.tagBarDivider} />}
                  {groupedFilterTags.other.map(renderTag)}
                </ScrollView>
              </View>
              <NextMealCard enabled={dataQueriesEnabled} />
            </Reanimated.View>
          }
          ListFooterComponent={
            <RecipeSearchFooter
              filterFavourites={filterFavourites}
              hasSearchQuery={hasSearchQuery}
              isSemanticLoading={isSemanticLoading}
              recipeCount={filtered.length}
              selectedTagCount={selectedTagIds.size}
              onClearFilters={handleClearFilters}
              onAddRecipe={() => addRecipeSheetRef.current?.present()}
            />
          }
        />
      </MarqueeSyncProvider>
      <FloatingAddButton accessibilityLabel={t('nav.addRecipe')} sheetRef={addRecipeSheetRef} />
      <AddRecipeDrawer ref={addRecipeSheetRef} />
    </View>
  )
}

export default RecipesScreen
