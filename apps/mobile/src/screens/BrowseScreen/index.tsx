import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, type FlatList, type LayoutChangeEvent, type ListRenderItemInfo, View } from 'react-native'
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { useRecipes, useSemanticRecipeSearch } from '@carrot/shared/hooks/useRecipes'
import { useTags } from '@carrot/shared/hooks/useTags'
import type { RecipeOut } from '@carrot/shared/types'
import { groupTagsByCategory, matchesTagFilters } from '@carrot/shared/utils/tagFilters'
import { AppText, RecipeRow } from '../../components/ui'
import { useScreenLoading } from '../../hooks/useScreenLoading'
import { useHousehold } from '../../context/HouseholdContext'
import { useAuth } from '../../context/AuthContext'
import { useMotion } from '../../theme'
import BrowseEmpty from './BrowseEmpty'
import CountLine from './CountLine'
import FilterBar from './FilterBar'
import { NoResults, SemanticHeader, SemanticLoading } from './ListStates'
import {
  COUNT_LINE_HEIGHT,
  SORT_OPTIONS,
  applyFavouriteOverrides,
  buildBrowseItems,
  buildItemLayouts,
  buildRecipeIndex,
  countRemovedRecipes,
  getBrowseItemKey,
  normalizeText,
  sortRecipes,
  type BrowseListItem,
} from './helpers'
import { styles } from './styles'
import { useBrowseFilters } from './useBrowseFilters'
import { useBrowseHeader } from './useBrowseHeader'
import { useRecipeActions } from './useRecipeActions'

const ESTIMATED_FILTER_BAR_HEIGHT = 54
const SKIP_EXIT_ANIMATION_THRESHOLD = 20

const BrowseScreen = () => {
  const router = useRouter()
  const { t } = useTranslation()
  const motion = useMotion()
  const { user, loading: authLoading } = useAuth()
  const { isLoadingHouseholds, activeHouseholdId } = useHousehold()
  const dataQueriesEnabled = !authLoading && user !== null && !isLoadingHouseholds && activeHouseholdId != null
  const { recipes, isLoading, isFetching, error } = useRecipes(dataQueriesEnabled)
  const { tags } = useTags()

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const headerHeight = useHeaderHeight()
  const [filterBarHeight, setFilterBarHeight] = useState(ESTIMATED_FILTER_BAR_HEIGHT)
  const listRef = useRef<FlatList<BrowseListItem>>(null)
  // The list is inset below the transparent header, so its resting offset is negative.
  const scrollToTop = useCallback(
    () => listRef.current?.scrollToOffset({ offset: -headerHeight, animated: false }),
    [headerHeight],
  )
  const { filters, setSort, toggleTag, toggleFavourites, clearTags, clearFilters } = useBrowseFilters(scrollToTop)
  const { sort, tagIds: selectedTagIds, favouritesOnly: filterFavourites } = filters

  const handleSearchChangeText = useCallback((e: { nativeEvent: { text: string } }) => setQuery(e.nativeEvent.text), [])
  const handleSearchCancel = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setQuery('')
  }, [])

  const { switchingHousehold } = useBrowseHeader({
    isFetching,
    sort,
    onSortChange: setSort,
    onSearchChangeText: handleSearchChangeText,
    onSearchCancel: handleSearchCancel,
  })
  const { busy, showSpinner } = useScreenLoading(isLoading || switchingHousehold)

  const trimmedQuery = deferredQuery.trim()
  const searchActive = trimmedQuery.length > 0
  const normalizedQuery = useMemo(() => normalizeText(deferredQuery), [deferredQuery])

  const { semanticRecipes, isSemanticLoading } = useSemanticRecipeSearch(
    deferredQuery,
    user ? `${user.id}:${activeHouseholdId ?? 'personal'}` : null,
  )

  const recipeLookupRef = useRef(new Map<string, RecipeOut>())
  const getRecipe = useCallback((id: string) => recipeLookupRef.current.get(id), [])
  const { favouriteOverrides, handleRecipeLongPress, handleToggleFavourite } = useRecipeActions(getRecipe)

  const previousIdsRef = useRef<Set<string> | null>(null)

  const recipeIndex = useMemo(() => buildRecipeIndex(recipes), [recipes])
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

  const skipExiting = useMemo(
    () =>
      previousIdsRef.current !== null &&
      countRemovedRecipes(previousIdsRef.current, items) > SKIP_EXIT_ANIMATION_THRESHOLD,
    [items],
  )

  useEffect(() => {
    if (busy) return

    const ids = new Set<string>()
    for (const item of items) if (item.type === 'recipe') ids.add(item.recipe.id)
    previousIdsRef.current = ids
  }, [busy, items])

  const listHeaderHeight = searchActive ? 0 : filterBarHeight + COUNT_LINE_HEIGHT
  const itemLayouts = useMemo(() => buildItemLayouts(items, listHeaderHeight), [items, listHeaderHeight])
  const getItemLayout = useCallback((_: ArrayLike<BrowseListItem> | null | undefined, index: number) => itemLayouts[index], [itemLayouts])

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

  const handleClearFilters = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    clearFilters()
  }, [clearFilters])

  const handleAddRecipe = useCallback(() => {
    router.navigate({ pathname: '/(tabs)/home', params: { openAddRecipe: '1' } })
  }, [router])

  const sortLabel = t(SORT_OPTIONS.find((option) => option.key === sort)?.labelKey ?? SORT_OPTIONS[0].labelKey)
  const semanticLoadingLabel = t('recipes.semanticSearchLoading')
  const semanticHeaderLabel = t('recipes.sectionSuggested')

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<BrowseListItem>) => {
      if (item.type === 'semantic-header') return <SemanticHeader label={semanticHeaderLabel} />
      if (item.type === 'semantic-loading') return <SemanticLoading label={semanticLoadingLabel} />
      if (item.type === 'no-results') return <NoResults query={trimmedQuery} />

      const { recipe } = item
      const isNew = !searchActive && previousIdsRef.current !== null && !previousIdsRef.current.has(recipe.id)
      const showDivider = items[index + 1]?.type === 'recipe'

      return (
        <RecipeRow
          recipe={recipe}
          entering={isNew ? motion.fade : undefined}
          exiting={motion.exiting}
          showDivider={showDivider}
          onLongPress={handleRecipeLongPress}
          onToggleFavourite={handleToggleFavourite}
        />
      )
    },
    [
      handleRecipeLongPress,
      handleToggleFavourite,
      items,
      motion.exiting,
      motion.fade,
      searchActive,
      semanticHeaderLabel,
      semanticLoadingLabel,
      trimmedQuery,
    ],
  )

  const listHeader = useMemo(
    () =>
      searchActive ? null : (
        <View style={{ paddingTop: filterBarHeight }}>
          <CountLine count={literalRecipes.length} sortLabel={sortLabel} />
        </View>
      ),
    [searchActive, filterBarHeight, literalRecipes.length, sortLabel],
  )

  const listEmpty = useMemo(
    () => (
      <BrowseEmpty
        hasActiveFilters={selectedTagIds.size > 0 || filterFavourites}
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
        <AppText tone="error" style={styles.errorText}>
          {error.message}
        </AppText>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <LayoutAnimationConfig skipExiting={skipExiting}>
        <Animated.FlatList
          ref={listRef}
          data={items}
          keyExtractor={getBrowseItemKey}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          itemLayoutAnimation={motion.layout}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.listContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          removeClippedSubviews
          windowSize={7}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
        />
      </LayoutAnimationConfig>
      {!searchActive && (
        <FilterBar
          groupedTags={groupedFilterTags}
          selectedTagIds={selectedTagIds}
          filterFavourites={filterFavourites}
          onToggleTag={toggleTag}
          onClearCategory={clearTags}
          onToggleFavourites={toggleFavourites}
          top={headerHeight}
          onLayout={handleFilterBarLayout}
        />
      )}
    </View>
  )
}

export default BrowseScreen
