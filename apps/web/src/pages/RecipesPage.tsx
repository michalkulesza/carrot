import { useState, useRef, useEffect } from 'react'
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  toast,
} from '@heroui/react'
import PageHeader from '../components/PageHeader'
import RecipeDetailModal from '../components/RecipeDetailModal'
import RecipesTable from '../components/RecipesTable'
import { RecipeOut, Tag, UserPreferences, deleteRecipe } from '../api/client'
import { useHousehold } from '../context/HouseholdContext'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { tTag } from '../utils/tagUtils'

function RecipeThumb({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="w-16 h-16 rounded-lg shrink-0 overflow-hidden bg-zinc-100 relative">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-zinc-200" />
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}

function CardMenu({
  onView,
  onEdit,
  onDelete,
}: {
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)

    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative self-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors text-base leading-none"
        aria-label="Recipe actions"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-36 rounded-xl bg-white shadow-xl border border-zinc-100 py-1 overflow-hidden">
          <button
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-50 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onView()
            }}
          >
            {t('common.view')}
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-50 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onEdit()
            }}
          >
            {t('common.edit')}
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger-50 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onDelete()
            }}
          >
            {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  )
}

interface RecipesPageProps {
  recipes: RecipeOut[]
  loading: boolean
  allTags: Tag[]
  onTagCreated: (tag: Tag) => void
  onRecipeUpdated: (r: RecipeOut) => void
  onRecipeDeleted: (id: string) => void
  preferences: UserPreferences | null
}

function RecipeCard({
  recipe,
  onView,
  onEdit,
  onDelete,
  onTagClick,
}: {
  recipe: RecipeOut
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onTagClick: (tag: Tag) => void
}) {
  const { t } = useTranslation()
  const proxyUrl = recipe.thumbnail_url
    ? `/api/proxy/image?url=${encodeURIComponent(recipe.thumbnail_url)}`
    : null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onView()
      }}
      className="flex gap-3 items-start p-3 rounded-xl bg-white shadow-sm w-full text-left active:opacity-70 transition-opacity cursor-pointer"
    >
      {proxyUrl && <RecipeThumb src={proxyUrl} alt={recipe.title} />}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-snug line-clamp-2">
          {recipe.title}
        </p>
        {recipe.creator_handle && (
          <p className="text-xs text-zinc-400 mt-0.5">
            @{recipe.creator_handle}
          </p>
        )}
        <div className="flex gap-2 mt-1.5 flex-wrap">
          {recipe.servings != null && (
            <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
              {t('recipes.servings', { count: recipe.servings })}
            </span>
          )}
          {recipe.kcal_per_serving != null && (
            <span className="text-xs text-warning-700 font-medium bg-warning/10 px-2 py-0.5 rounded-full">
              {recipe.kcal_per_serving} kcal
            </span>
          )}
        </div>
        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {recipe.tags.map((tag) => (
              <span
                key={tag.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onTagClick(tag)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    onTagClick(tag)
                  }
                }}
                className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary/15 text-secondary-700 cursor-pointer hover:bg-secondary/25 transition-colors"
              >
                {tTag(tag.name, t)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <CardMenu onView={onView} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  )
}

function SearchResultItem({
  recipe,
  matchedIngredient,
  onClick,
}: {
  recipe: RecipeOut
  matchedIngredient?: string
  onClick: () => void
}) {
  const proxyUrl = recipe.thumbnail_url
    ? `/api/proxy/image?url=${encodeURIComponent(recipe.thumbnail_url)}`
    : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-zinc-50 transition-colors border-b border-zinc-100 last:border-b-0"
    >
      {proxyUrl ? (
        <img
          src={proxyUrl}
          alt=""
          className="w-10 h-10 rounded-lg object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-zinc-100 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{recipe.title}</p>
        {matchedIngredient && (
          <p className="text-xs text-zinc-400 truncate mt-0.5">
            {matchedIngredient}
          </p>
        )}
      </div>
    </button>
  )
}

export default function RecipesPage({
  recipes,
  loading,
  allTags,
  onTagCreated,
  onRecipeUpdated,
  onRecipeDeleted,
  preferences,
}: RecipesPageProps) {
  const { activeHouseholdId, activeHousehold } = useHousehold()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeAllergens: string[] = activeHousehold?.allergens
    ? [
        ...(activeHousehold.allergens.predefined ?? []),
        ...(activeHousehold.allergens.custom ?? []),
      ]
    : preferences?.personal_allergens
      ? [
          ...(preferences.personal_allergens.predefined ?? []),
          ...(preferences.personal_allergens.custom ?? []),
        ]
      : []
  const [selected, setSelected] = useState<RecipeOut | null>(null)
  const [openInEdit, setOpenInEdit] = useState(false)
  const [scrollToStep, setScrollToStep] = useState<{
    componentIndex: number
    stepIndex: number
  } | null>(null)
  const [filterTag, setFilterTag] = useState<Tag | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<RecipeOut | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Open recipe + scroll to step when navigated from timer popup / notification
  useEffect(() => {
    const recipeId = searchParams.get('recipe')
    if (!recipeId || loading) return
    const recipe = recipes.find((r) => r.id === recipeId)
    if (!recipe) return
    const stepParam = searchParams.get('step')
    if (stepParam) {
      const [ci, si] = stepParam.split('-').map(Number)
      if (!Number.isNaN(ci) && !Number.isNaN(si)) {
        setScrollToStep({ componentIndex: ci, stepIndex: si })
      }
    }
    setOpenInEdit(false)
    setSelected(recipe)
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [searchParams, recipes, loading])

  const displayed = (
    filterTag
      ? recipes.filter((r) => r.tags.some((t) => t.id === filterTag.id))
      : recipes
  )
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

  const q = searchQuery.trim().toLowerCase()
  const titleMatches = q
    ? recipes.filter((r) => r.title.toLowerCase().includes(q))
    : []
  const ingredientMatches: { recipe: RecipeOut; matchedIngredient: string }[] =
    []
  if (q) {
    for (const recipe of recipes) {
      for (const component of recipe.components) {
        const match = component.ingredients.find((ing) =>
          ing.toLowerCase().includes(q)
        )
        if (match) {
          ingredientMatches.push({ recipe, matchedIngredient: match })
          break
        }
      }
    }
  }

  function openView(recipe: RecipeOut) {
    setOpenInEdit(false)
    setSelected(recipe)
  }

  function openEdit(recipe: RecipeOut) {
    setOpenInEdit(true)
    setSelected(recipe)
  }

  function handleUpdated(updated: RecipeOut) {
    onRecipeUpdated(updated)
    setSelected(updated)
  }

  function handleModalDeleted(id: string) {
    onRecipeDeleted(id)
    setSelected(null)
  }

  async function confirmDelete() {
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
  }

  const searchInput = (
    <div className="relative flex items-center w-full">
      <svg
        className="absolute left-3 w-4 h-4 text-zinc-400 pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
        />
      </svg>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t('recipes.searchPlaceholder')}
        className="w-full pl-9 pr-8 py-2 text-sm rounded-full bg-white border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-zinc-400"
      />
      {searchQuery && (
        <button
          type="button"
          onClick={() => setSearchQuery('')}
          className="absolute right-3 text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  )

  return (
    <>
      <PageHeader title={t('nav.recipes')} searchSlot={searchInput} />

      {/* Mobile search */}
      <div className="md:hidden px-4 mt-3">{searchInput}</div>

      {/* Everything below anchors the overlay */}
      <div className="relative">
        {/* Search overlay — appears below mobile search on mobile, below header on desktop */}
        {q && (
          <div className="absolute left-2 right-2 top-2 z-40 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto">
              {titleMatches.length === 0 && ingredientMatches.length === 0 ? (
                <p className="px-4 py-8 text-sm text-zinc-400 text-center">
                  {t('recipes.noResults')}
                </p>
              ) : (
                <>
                  {titleMatches.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100">
                        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
                          {t('recipes.sectionRecipes')}
                        </span>
                      </div>
                      {titleMatches.map((r) => (
                        <SearchResultItem
                          key={r.id}
                          recipe={r}
                          onClick={() => {
                            setSearchQuery('')
                            openView(r)
                          }}
                        />
                      ))}
                    </>
                  )}
                  {ingredientMatches.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-100">
                        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
                          {t('recipes.sectionIngredients')}
                        </span>
                      </div>
                      {ingredientMatches.map(
                        ({ recipe, matchedIngredient }) => (
                          <SearchResultItem
                            key={recipe.id}
                            recipe={recipe}
                            matchedIngredient={matchedIngredient}
                            onClick={() => {
                              setSearchQuery('')
                              openView(recipe)
                            }}
                          />
                        )
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {allTags.length > 0 && (
          <div className="flex gap-2 px-4 mt-3 overflow-x-auto pb-1 scrollbar-hide">
            {allTags.map((tag) => {
              const active = filterTag?.id === tag.id

              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setFilterTag(active ? null : tag)}
                  className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                    active
                      ? 'bg-secondary text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {tTag(tag.name, t)}
                </button>
              )
            })}
          </div>
        )}

        {loading ? (
          <>
            {/* Mobile skeleton */}
            <div className="md:hidden flex flex-col gap-3 px-4 mt-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl bg-zinc-100 animate-pulse"
                />
              ))}
            </div>
            {/* Desktop skeleton */}
            <div className="hidden md:block px-4 mt-4">
              <div className="rounded-xl bg-white shadow-sm border border-zinc-100 overflow-hidden">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex gap-3 items-center px-4 py-3 border-b border-zinc-100"
                  >
                    <div className="w-4 h-4 rounded bg-zinc-100 animate-pulse shrink-0" />
                    <div className="w-12 h-12 rounded-lg bg-zinc-100 animate-pulse shrink-0" />
                    <div className="flex-1 h-4 rounded bg-zinc-100 animate-pulse" />
                    <div className="w-16 h-4 rounded bg-zinc-100 animate-pulse" />
                    <div className="w-16 h-4 rounded bg-zinc-100 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : displayed.length === 0 && recipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-400 px-4 text-center">
            <p className="text-lg">{t('recipes.noRecipesYet')}</p>
            <p className="text-sm mt-1">{t('recipes.addPrompt')}</p>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-400 px-4 text-center">
            <p className="text-lg">{t('recipes.noRecipesWithTag')}</p>
            <button
              onClick={() => setFilterTag(null)}
              className="text-sm text-primary mt-1"
            >
              {t('recipes.clearFilter')}
            </button>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden flex flex-col gap-3 px-4 mt-4">
              {displayed.map((r) => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  onView={() => openView(r)}
                  onEdit={() => openEdit(r)}
                  onDelete={() => setDeleteTarget(r)}
                  onTagClick={setFilterTag}
                />
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <RecipesTable
                recipes={displayed}
                showAddedBy={!!activeHouseholdId}
                onView={openView}
                onEdit={openEdit}
                onDelete={(r) => setDeleteTarget(r)}
              />
            </div>
          </>
        )}
      </div>
      {/* end relative wrapper */}

      {/* Recipe detail modal */}
      <RecipeDetailModal
        recipe={selected}
        allTags={allTags}
        onTagCreated={onTagCreated}
        onClose={() => {
          setSelected(null)
          setScrollToStep(null)
        }}
        onUpdated={handleUpdated}
        onDeleted={handleModalDeleted}
        initialMode={openInEdit ? 'editing' : 'view'}
        activeAllergens={activeAllergens}
        scrollToStep={scrollToStep}
      />

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <ModalBackdrop isDismissable>
          <ModalContainer size="sm" className="!rounded-xl">
            <ModalDialog>
              <ModalHeader className="text-base font-semibold">
                {t('recipes.deleteTitle')}
              </ModalHeader>
              <ModalBody>
                <p className="text-sm text-zinc-600">
                  {t('recipes.deleteConfirm', { title: deleteTarget?.title })}
                </p>
              </ModalBody>
              <ModalFooter className="flex justify-end gap-2">
                <Button
                  variant="tertiary"
                  onPress={() => setDeleteTarget(null)}
                  isDisabled={deleting}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="danger"
                  onPress={confirmDelete}
                  isDisabled={deleting}
                >
                  {deleting ? t('common.deleting') : t('common.delete')}
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  )
}
