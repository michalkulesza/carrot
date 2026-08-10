import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from '@heroui/react'
import type { ImportJob, RecipeOut, Tag } from '@carrot/shared/types'
import PageHeader from '../../components/PageHeader'
import NextMealCard from '../../components/NextMealCard'
import RecipesTable from '../../components/RecipesTable'
import { deleteRecipe } from '../../api/client'
import { useHousehold } from '../../context/HouseholdContext'
import { useSemanticRecipeSearch } from '@carrot/shared/hooks/useRecipes'
import RecipeSearchInput from './RecipeSearchInput'
import SearchOverlay from './SearchOverlay'
import FilterBar from './FilterBar'
import RecipeCard from './RecipeCard'
import RecipesLoadingSkeleton from './RecipesLoadingSkeleton'
import NoRecipesEmptyState from './NoRecipesEmptyState'
import NoMatchingRecipesEmptyState from './NoMatchingRecipesEmptyState'
import DeleteRecipeModal from './DeleteRecipeModal'
import ImportJobCards from './ImportJobCards'
import { useFavouriteOverrides } from './useFavouriteOverrides'
import { useRouteNavigation } from '../../routing/RouteNavigationContext'
import { parseRecipeFilters, recipeFiltersPath } from '../../routing/routeState'
import {
  applyFavouriteOverrides,
  filterAndSortRecipes,
  searchIngredientMatches,
  searchTitleMatches,
} from './helpers'

interface RecipesPageProps {
  recipes: RecipeOut[]
  loading: boolean
  allTags: Tag[]
  onRecipeUpdated: (r: RecipeOut) => void
  onRecipeDeleted: (id: string) => void
  importJobs: ImportJob[]
  onRetryImportJob: (jobId: string) => Promise<unknown>
  onDismissImportJob: (jobId: string) => Promise<unknown>
  onContinueImportManually: (sourceUrl: string | null) => void
  onAddRecipe: () => void
}

const RecipesPage = ({
  recipes,
  loading,
  allTags,
  onRecipeUpdated,
  onRecipeDeleted,
  importJobs,
  onRetryImportJob,
  onDismissImportJob,
  onContinueImportManually,
  onAddRecipe,
}: RecipesPageProps) => {
  const { activeHouseholdId } = useHousehold()
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { openRecipe } = useRouteNavigation()
  const filters = useMemo(
    () =>
      parseRecipeFilters(
        new URLSearchParams(location.search),
        new Set(allTags.map((tag) => tag.id))
      ),
    [allTags, location.search]
  )
  const filterFavourites = filters.favourites
  const selectedTagIds = useMemo(
    () => new Set(filters.tagIds),
    [filters.tagIds]
  )
  const searchQuery = filters.q
  const [deleteTarget, setDeleteTarget] = useState<RecipeOut | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { favouriteOverrides, handleToggleFavourite } =
    useFavouriteOverrides(onRecipeUpdated)

  const recipesWithOverrides = applyFavouriteOverrides(
    recipes,
    favouriteOverrides
  )
  const displayed = filterAndSortRecipes(
    recipesWithOverrides,
    filterFavourites,
    allTags,
    selectedTagIds
  )

  const query = searchQuery.trim().toLowerCase()
  const { semanticRecipes, isSemanticLoading } = useSemanticRecipeSearch(
    searchQuery,
    activeHouseholdId ?? 'personal'
  )
  const showImportJobs =
    !query && !filterFavourites && selectedTagIds.size === 0
  const titleMatches = searchTitleMatches(recipes, query)
  const rawIngredientMatches = searchIngredientMatches(recipes, query)
  const titleMatchIds = new Set(titleMatches.map((recipe) => recipe.id))
  const ingredientMatches = rawIngredientMatches.filter(
    ({ recipe }) => !titleMatchIds.has(recipe.id)
  )
  const literalIds = new Set([
    ...titleMatchIds,
    ...ingredientMatches.map(({ recipe }) => recipe.id),
  ])
  const semanticMatches = semanticRecipes.filter(
    (recipe) => !literalIds.has(recipe.id)
  )

  const updateFilters = useCallback(
    (next: typeof filters) => {
      navigate(recipeFiltersPath(location, next), { replace: true })
    },
    [filters, location, navigate]
  )
  const openView = useCallback(
    (recipe: RecipeOut) => openRecipe(recipe.id),
    [openRecipe]
  )
  const openEdit = useCallback(
    (recipe: RecipeOut) => openRecipe(recipe.id, { editing: true }),
    [openRecipe]
  )

  const handleSelectSearchResult = useCallback(
    (recipe: RecipeOut) => {
      updateFilters({ ...filters, q: '' })
      openView(recipe)
    },
    [filters, openView, updateFilters]
  )

  const handleClearFilters = useCallback(() => {
    updateFilters({ ...filters, favourites: false, tagIds: [] })
  }, [filters, updateFilters])

  const handleToggleFilterFavourites = useCallback(() => {
    updateFilters({ ...filters, favourites: !filters.favourites })
  }, [filters, updateFilters])

  const handleToggleTag = useCallback(
    (tagId: string) => {
      const next = new Set(filters.tagIds)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      updateFilters({ ...filters, tagIds: [...next] })
    },
    [filters, updateFilters]
  )

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteRecipe(deleteTarget.id)
      toast.danger(t('recipes.recipeDeleted'), { timeout: 3000 })
      onRecipeDeleted(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      toast.danger(t('recipes.failedToDelete'), { timeout: 3000 })
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, onRecipeDeleted, t])

  const searchOverlay = query ? (
    <SearchOverlay
      titleMatches={titleMatches}
      ingredientMatches={ingredientMatches}
      semanticMatches={semanticMatches}
      isSemanticLoading={isSemanticLoading}
      onSelectRecipe={handleSelectSearchResult}
    />
  ) : null
  const searchInput = (
    <RecipeSearchInput
      searchQuery={searchQuery}
      isSemanticLoading={isSemanticLoading}
      searchOverlay={searchOverlay}
      onSearchQueryChange={(q) => updateFilters({ ...filters, q })}
    />
  )

  return (
    <>
      <PageHeader title={t('nav.recipes')} searchSlot={searchInput} />

      <div className="md:hidden px-4 mt-3">{searchInput}</div>

      <div>
        <div className="md:hidden px-4 mt-3">
          <NextMealCard />
        </div>

        <FilterBar
          allTags={allTags}
          filterFavourites={filterFavourites}
          onToggleFilterFavourites={handleToggleFilterFavourites}
          selectedTagIds={selectedTagIds}
          onToggleTag={handleToggleTag}
        />

        {showImportJobs && (
          <ImportJobCards
            jobs={importJobs}
            onRetry={onRetryImportJob}
            onDismiss={onDismissImportJob}
            onContinueManually={onContinueImportManually}
          />
        )}

        {loading ? (
          <RecipesLoadingSkeleton />
        ) : displayed.length === 0 && recipes.length === 0 ? (
          <NoRecipesEmptyState onAddRecipe={onAddRecipe} />
        ) : displayed.length === 0 ? (
          <NoMatchingRecipesEmptyState
            filterFavourites={filterFavourites}
            filterTag={selectedTagIds.size > 0}
            onClearFilters={handleClearFilters}
          />
        ) : (
          <>
            <div className="md:hidden flex flex-col gap-3 px-4 mt-4">
              {displayed.map((r) => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  onView={() => openView(r)}
                  onEdit={() => openEdit(r)}
                  onDelete={() => setDeleteTarget(r)}
                  onToggleTag={handleToggleTag}
                  onToggleFavourite={() => handleToggleFavourite(r)}
                />
              ))}
            </div>

            <div className="hidden md:block">
              <RecipesTable
                recipes={displayed}
                showAddedBy={!!activeHouseholdId}
                onView={openView}
                onEdit={openEdit}
                onDelete={(r) => setDeleteTarget(r)}
                onToggleFavourite={handleToggleFavourite}
              />
            </div>
          </>
        )}
      </div>

      <DeleteRecipeModal
        deleteTarget={deleteTarget}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </>
  )
}

export default RecipesPage
