import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from '@heroui/react'
import type { ImportJob, RecipeOut, Tag, UserPreferences } from '@carrot/shared/types'
import PageHeader from '../../components/PageHeader'
import NextMealCard from '../../components/NextMealCard'
import RecipeDetailModal from '../../components/RecipeDetailModal'
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
import { useOpenRecipeFromQuery } from './useOpenRecipeFromQuery'
import type { StepLocation } from './useOpenRecipeFromQuery'
import {
  applyFavouriteOverrides,
  filterAndSortRecipes,
  getActiveAllergens,
  searchIngredientMatches,
  searchTitleMatches,
} from './helpers'

interface RecipesPageProps {
  recipes: RecipeOut[]
  loading: boolean
  allTags: Tag[]
  onRecipeUpdated: (r: RecipeOut) => void
  onRecipeDeleted: (id: string) => void
  preferences: UserPreferences | null
  importJobs: ImportJob[]
}

const RecipesPage = ({
  recipes,
  loading,
  allTags,
  onRecipeUpdated,
  onRecipeDeleted,
  preferences,
  importJobs,
}: RecipesPageProps) => {
  const { activeHouseholdId, activeHousehold } = useHousehold()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filterFavourites, setFilterFavourites] = useState(false)
  const [selected, setSelected] = useState<RecipeOut | null>(null)
  const [openInEdit, setOpenInEdit] = useState(false)
  const [scrollToStep, setScrollToStep] = useState<StepLocation | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<RecipeOut | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { favouriteOverrides, handleToggleFavourite } =
    useFavouriteOverrides(onRecipeUpdated)

  useOpenRecipeFromQuery({
    recipes,
    loading,
    searchParams,
    setSearchParams,
    setSelected,
    setOpenInEdit,
    setScrollToStep,
  })

  const activeAllergens = getActiveAllergens(activeHousehold, preferences)
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
    activeHouseholdId ?? 'personal',
  )
  const showImportJobs = !query && !filterFavourites && selectedTagIds.size === 0
  const titleMatches = searchTitleMatches(recipes, query)
  const rawIngredientMatches = searchIngredientMatches(recipes, query)
  const titleMatchIds = new Set(titleMatches.map((recipe) => recipe.id))
  const ingredientMatches = rawIngredientMatches.filter(({ recipe }) => !titleMatchIds.has(recipe.id))
  const literalIds = new Set([...titleMatchIds, ...ingredientMatches.map(({ recipe }) => recipe.id)])
  const semanticMatches = semanticRecipes.filter((recipe) => !literalIds.has(recipe.id))

  const openView = useCallback((recipe: RecipeOut) => {
    setOpenInEdit(false)
    setSelected(recipe)
  }, [])

  const openEdit = useCallback((recipe: RecipeOut) => {
    setOpenInEdit(true)
    setSelected(recipe)
  }, [])

  const handleSelectSearchResult = useCallback(
    (recipe: RecipeOut) => {
      setSearchQuery('')
      openView(recipe)
    },
    [openView]
  )

  const handleUpdated = useCallback(
    (updated: RecipeOut) => {
      onRecipeUpdated(updated)
      setSelected(updated)
    },
    [onRecipeUpdated]
  )

  const handleModalDeleted = useCallback(
    (id: string) => {
      onRecipeDeleted(id)
      setSelected(null)
    },
    [onRecipeDeleted]
  )

  const handleModalClose = useCallback(() => {
    setSelected(null)
    setScrollToStep(null)
  }, [])

  const handleClearFilters = useCallback(() => {
    setSelectedTagIds(new Set())
    setFilterFavourites(false)
  }, [])

  const handleToggleFilterFavourites = useCallback(() => {
    setFilterFavourites((v) => !v)
  }, [])

  const handleToggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)

      return next
    })
  }, [])

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
      onSearchQueryChange={setSearchQuery}
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

        {showImportJobs && <ImportJobCards jobs={importJobs} />}

        {loading ? (
          <RecipesLoadingSkeleton />
        ) : displayed.length === 0 && recipes.length === 0 ? (
          <NoRecipesEmptyState />
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

      <RecipeDetailModal
        recipe={selected}
        allTags={allTags}
        onClose={handleModalClose}
        onUpdated={handleUpdated}
        onDeleted={handleModalDeleted}
        onOpenRecipe={(id) => {
          const related = recipes.find((recipe) => recipe.id === id)
          if (related) openView(related)
        }}
        initialMode={openInEdit ? 'editing' : 'view'}
        activeAllergens={activeAllergens}
        scrollToStep={scrollToStep}
      />

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
