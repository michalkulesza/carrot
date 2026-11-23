import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, type LayoutChangeEvent, Text, View } from 'react-native'
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useNavigation, useRouter } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import type { NativeActionEvent } from '@react-native-menu/menu'
import { useRecipes, useSemanticRecipeSearch } from '@carrot/shared/hooks/useRecipes'
import { useTags } from '@carrot/shared/hooks/useTags'
import type { RecipeOut } from '@carrot/shared/types'
import { groupTagsByCategory, matchesTagFilters } from '@carrot/shared/utils/tagFilters'
import { MarqueeSyncProvider } from '../../components/MarqueeSync'
import HouseholdHeaderTitle from '../../components/HouseholdHeaderTitle'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { useHouseholdMenu } from '../../hooks/useHouseholdMenu'
import { useHousehold } from '../../context/HouseholdContext'
import { useAuth } from '../../context/AuthContext'
import BrowseEmpty from './BrowseEmpty'
import FilterBar from './FilterBar'
import HeaderRight from './HeaderRight'
import RecipeCard from './RecipeCard'
import {
  SORT_OPTIONS,
  applyFavouriteOverrides,
  buildBrowseItems,
  buildHouseholdAvatars,
  buildRecipeIndex,
  getBrowseItemKey,
  getBrowseItemType,
  normalizeText,
  sortRecipes,
  type BrowseListItem,
  type HouseholdAvatar,
} from './helpers'
import { styles } from './styles'
import { useBrowseFilters } from './useBrowseFilters'
import { useRecipeActions } from './useRecipeActions'

const NO_AVATARS: HouseholdAvatar[] = []
const ESTIMATED_FILTER_BAR_HEIGHT = 44

const SemanticHeader = ({ label }: { label: string }) => <Text style={styles.semanticHeader}>{label}</Text>

const SemanticLoading = ({ label }: { label: string }) => (
  <View style={styles.searchLoading} accessibilityLiveRegion="polite">
    <ActivityIndicator accessibilityLabel={label} />
    <Text style={styles.searchLoadingText}>{label}</Text>
  </View>
)

const NoResults = ({ query }: { query: string }) => {
  const { t } = useTranslation()

  return (
    <View style={styles.noResults}>
      <Text style={styles.emptyText}>{t('browse.noResults', { query })}</Text>
    </View>
  )
}

const BrowseScreen = () => {
  const navigation = useNavigation()
  const router = useRouter()
  const { t } = useTranslation()
  const { user, loading: authLoading } = useAuth()
  const { households, isLoadingHouseholds, activeHouseholdId, activeHousehold } = useHousehold()
  const dataQueriesEnabled = !authLoading && user !== null && !isLoadingHouseholds && activeHouseholdId != null
  const { recipes, isLoading, isFetching, error } = useRecipes(dataQueriesEnabled)
  const { householdMenuActions, handleHouseholdAction, handleHouseholdMenuOpen, switchingHousehold } =
    useHouseholdMenu(isFetching)
  const { busy, showSpinner } = useScreenLoading(isLoading || switchingHousehold)
  const { tags } = useTags()

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const headerHeight = useHeaderHeight()
  const [filterBarHeight, setFilterBarHeight] = useState(ESTIMATED_FILTER_BAR_HEIGHT)
  const listRef = useRef<FlashListRef<BrowseListItem>>(null)
  // The list is inset below the transparent header, so its resting offset is negative.
  const scrollToTop = useCallback(
    () => listRef.current?.scrollToOffset({ offset: -headerHeight, animated: false }),
    [headerHeight],
  )
  const { filters, setSort, toggleTag, toggleFavourites, clearFilters } = useBrowseFilters(scrollToTop)
  const { sort, tagIds: selectedTagIds, favouritesOnly: filterFavourites } = filters

  const trimmedQuery = deferredQuery.trim()
  const searchActive = trimmedQuery.length > 0
  const normalizedQuery = useMemo(() => normalizeText(deferredQuery), [deferredQuery])

  const { semanticRecipes, isSemanticLoading } = useSemanticRecipeSearch(
    deferredQuery,
    user ? `${user.id}:${activeHouseholdId ?? 'personal'}` : null,
  )

  const recipeLookupRef = useRef(new Map<string, RecipeOut>())
  const getRecipe = useCallback((id: string) => recipeLookupRef.current.get(id), [])
  const { favouriteOverrides, handleRecipePress, handleRecipeLongPress, handleToggleFavourite } =
    useRecipeActions(getRecipe)

  const seenIdsRef = useRef<Set<string>>(new Set())
  const initialLoadDoneRef = useRef(false)

  // Runs during render so rows rendered right after the first load already count as seen and don't animate in.
  if (!isLoading && !initialLoadDoneRef.current) {
    initialLoadDoneRef.current = true
    recipes.forEach((r) => seenIdsRef.current.add(r.id))
  }

  const recipeIndex = useMemo(() => buildRecipeIndex(recipes), [recipes])
  const householdAvatars = useMemo(() => buildHouseholdAvatars(recipes, households), [recipes, households])
  const recipesWithOverrides = useMemo(
    () => applyFavouriteOverrides(recipes, favouriteOverrides),
    [recipes, favouriteOverrides],
  )
  const semanticWithOverrides = useMemo(
    () => applyFavouriteOverrides(semanticRecipes, favouriteOverrides),
    [semanticRecipes, favouriteOverrides],
  )
  const sortedRecipes = useMemo(
    () => sortRecipes(recipesWithOverrides, sort, recipeIndex),
    [recipesWithOverrides, sort, recipeIndex],
  )

  const literalRecipes = useMemo(() => {
    if (searchActive) {
      return sortedRecipes.filter((r) => recipeIndex.normalizedTitles.get(r.id)?.includes(normalizedQuery))
    }
    if (selectedTagIds.size === 0 && !filterFavourites) return sortedRecipes

    return sortedRecipes.filter(
      (r) => matchesTagFilters(r.tags, tags, selectedTagIds) && (!filterFavourites || r.is_favourite),
    )
  }, [sortedRecipes, searchActive, normalizedQuery, recipeIndex, selectedTagIds, filterFavourites, tags])

  const similarRecipes = useMemo(() => {
    if (!searchActive) return []
    const literalIds = new Set(literalRecipes.map((r) => r.id))

    return semanticWithOverrides.filter((r) => !literalIds.has(r.id))
  }, [searchActive, literalRecipes, semanticWithOverrides])

  const items = useMemo(
    () =>
      buildBrowseItems({
        literal: literalRecipes,
        semantic: similarRecipes,
        hasQuery: searchActive,
        isSemanticLoading,
      }),
    [literalRecipes, similarRecipes, searchActive, isSemanticLoading],
  )
  const listTopInset = searchActive ? 0 : filterBarHeight
  const listContentStyle = useMemo(() => [styles.listContent, { paddingTop: listTopInset }], [listTopInset])

  const handleFilterBarLayout = useCallback(
    (event: LayoutChangeEvent) => setFilterBarHeight(event.nativeEvent.layout.height),
    [],
  )
  const groupedFilterTags = useMemo(() => groupTagsByCategory(tags), [tags])

  recipeLookupRef.current = useMemo(() => {
    const lookup = new Map<string, RecipeOut>()
    for (const r of recipesWithOverrides) lookup.set(r.id, r)
    for (const r of semanticWithOverrides) if (!lookup.has(r.id)) lookup.set(r.id, r)
    return lookup
  }, [recipesWithOverrides, semanticWithOverrides])

  const filterMenuActions = useMemo(
    () =>
      SORT_OPTIONS.map((o) => ({
        id: o.key,
        title: t(o.labelKey),
        state: (sort === o.key ? 'on' : 'off') as 'on' | 'off',
      })),
    [sort, t],
  )

  const handleFilterAction = useCallback(
    ({ nativeEvent }: NativeActionEvent) => {
      const sortOption = SORT_OPTIONS.find((o) => o.key === nativeEvent.event)
      if (sortOption) setSort(sortOption.key)
    },
    [setSort],
  )

  const handleSearchChangeText = useCallback((e: { nativeEvent: { text: string } }) => setQuery(e.nativeEvent.text), [])
  const handleSearchCancel = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setQuery('')
  }, [])

  const handleClearFilters = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    clearFilters()
  }, [clearFilters])

  const handleAddRecipe = useCallback(() => {
    router.navigate({ pathname: '/(tabs)/home', params: { openAddRecipe: '1' } })
  }, [router])

  const browseTitle = t('nav.browse')
  const switchContextLabel = t('households.switchContext')
  const sortByLabel = t('recipes.sortBy')
  const searchPlaceholder = t('recipes.searchPlaceholder')
  const semanticLoadingLabel = t('recipes.semanticSearchLoading')
  const semanticHeaderLabel = t('recipes.sectionSuggested')

  const renderHeaderTitle = useCallback(
    () => (
      <HouseholdHeaderTitle
        title={browseTitle}
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
      browseTitle,
      handleHouseholdAction,
      handleHouseholdMenuOpen,
      householdMenuActions,
      isLoadingHouseholds,
      switchContextLabel,
    ],
  )
  const renderHeaderRight = useCallback(
    () => (
      <HeaderRight sortByLabel={sortByLabel} filterMenuActions={filterMenuActions} onFilterAction={handleFilterAction} />
    ),
    [filterMenuActions, handleFilterAction, sortByLabel],
  )

  useLayoutEffect(() => {
    const headerOptions = {
      title: browseTitle,
      headerTitle: renderHeaderTitle,
      headerRight: renderHeaderRight,
      headerSearchBarOptions: {
        placeholder: searchPlaceholder,
        onChangeText: handleSearchChangeText,
        onCancelButtonPress: handleSearchCancel,
        hideWhenScrolling: false,
        hideNavigationBar: false,
        autoCapitalize: 'none' as const,
      },
    }

    navigation.setOptions(headerOptions)
  }, [
    browseTitle,
    handleSearchCancel,
    handleSearchChangeText,
    navigation,
    renderHeaderRight,
    renderHeaderTitle,
    searchPlaceholder,
  ])

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<BrowseListItem>) => {
      if (item.type === 'semantic-header') return <SemanticHeader label={semanticHeaderLabel} />
      if (item.type === 'semantic-loading') return <SemanticLoading label={semanticLoadingLabel} />
      if (item.type === 'no-results') return <NoResults query={trimmedQuery} />

      const { recipe } = item
      const isNew = !searchActive && initialLoadDoneRef.current && !seenIdsRef.current.has(recipe.id)
      seenIdsRef.current.add(recipe.id)

      return (
        <RecipeCard
          recipe={recipe}
          householdAvatars={householdAvatars.get(recipe.id) ?? NO_AVATARS}
          plain={searchActive}
          isNew={isNew}
          onPress={handleRecipePress}
          onLongPress={handleRecipeLongPress}
          onToggleFavourite={handleToggleFavourite}
        />
      )
    },
    [
      handleRecipeLongPress,
      handleRecipePress,
      handleToggleFavourite,
      householdAvatars,
      searchActive,
      semanticHeaderLabel,
      semanticLoadingLabel,
      trimmedQuery,
    ],
  )

  const listEmpty = useMemo(
    () => (
      <BrowseEmpty
        filterFavourites={filterFavourites}
        selectedTagCount={selectedTagIds.size}
        onClearFilters={handleClearFilters}
        onAddRecipe={handleAddRecipe}
      />
    ),
    [filterFavourites, selectedTagIds.size, handleClearFilters, handleAddRecipe],
  )

  if (busy) {
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
        <FlashList
          ref={listRef}
          data={items}
          keyExtractor={getBrowseItemKey}
          renderItem={renderItem}
          getItemType={getBrowseItemType}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={listContentStyle}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={listEmpty}
        />
      </MarqueeSyncProvider>
      {!searchActive && (
        <FilterBar
          groupedTags={groupedFilterTags}
          selectedTagIds={selectedTagIds}
          filterFavourites={filterFavourites}
          onToggleTag={toggleTag}
          onToggleFavourites={toggleFavourites}
          top={headerHeight}
          onLayout={handleFilterBarLayout}
        />
      )}
    </View>
  )
}

export default BrowseScreen
