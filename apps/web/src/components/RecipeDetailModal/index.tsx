import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  usePreferences,
  useRecipeServingPreference,
} from '@carrot/shared/hooks/usePreferences'
import { ModalBody, ModalContainer, ModalDialog, toast } from '@heroui/react'
import type { RecipeOut, SaveComponent, Tag } from '@carrot/shared/types'
import {
  toggleFavourite,
  updateRecipe,
  uploadThumbnail,
} from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useHousehold } from '../../context/HouseholdContext'
import AssignToMealPlanModal from '../AssignToMealPlanModal'
import {
  applyIngredientReplace,
  applyIngredientRestore,
  buildRecipeUpdateFromDraft,
  buildRecipeUpdateFromRecipe,
  toEditState,
  type Mode,
} from './helpers'
import { useRecipeDeletion } from './useRecipeDeletion'
import { useRecipeDraft } from './useRecipeDraft'
import { useRecipeNotes } from './useRecipeNotes'
import { useRecipeTags } from './useRecipeTags'
import { useScreenWakeLock } from './useScreenWakeLock'
import { useShoppingListActions } from './useShoppingListActions'
import CookMode from './CookMode'
import PopupRelatedSection from './PopupRelatedSection'
import RecipeEditLayout from './RecipeEditLayout'
import RecipeNotices from './RecipeNotices'
import RecipeViewLayout from './RecipeViewLayout'
import Modal from '../AnimatedModal'

interface RecipeDetailModalProps {
  isExiting?: boolean
  recipe: RecipeOut | null
  allTags: Tag[]
  onClose: () => void
  onUpdated?: (r: RecipeOut) => void
  onDeleted?: (id: string) => void
  onOpenRecipe?: (id: string) => void
  initialMode?: Mode
  activeAllergens?: string[]
  scrollToStep?: { componentIndex: number; stepIndex: number } | null
  cookModeOpen?: boolean
  onOpenCookMode?: () => void
  onCloseCookMode?: () => void
}

const RecipeDetailModal = ({
  isExiting = false,
  recipe,
  allTags,
  onClose,
  onUpdated,
  onDeleted,
  onOpenRecipe,
  initialMode,
  activeAllergens = [],
  scrollToStep,
  cookModeOpen = false,
  onOpenCookMode,
  onCloseCookMode,
}: RecipeDetailModalProps) => {
  const { t } = useTranslation()
  const wakeLock = useScreenWakeLock(Boolean(recipe))
  const { preferences } = usePreferences()
  const { user } = useAuth()
  const { households, activeHouseholdId } = useHousehold()
  const [mode, setMode] = useState<Mode>('view')
  // Shown straight away on tap; cleared once the recipe itself catches up.
  const [localFavourite, setLocalFavourite] = useState<boolean | null>(null)
  const favouritePendingRef = useRef(false)
  useEffect(() => {
    setLocalFavourite(null)
  }, [recipe?.id, recipe?.is_favourite])
  const [mealPlanOpen, setMealPlanOpen] = useState(false)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(
    new Set()
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imgUploading, setImgUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const unitSystem = preferences?.unit_system ?? 'metric'
  const originalServings = recipe?.servings ?? null
  const { selectedServings, setServings } = useRecipeServingPreference(
    recipe?.id,
    originalServings
  )
  const servingScale =
    recipe?.servings && selectedServings
      ? selectedServings / recipe.servings
      : 1

  const { draft, setDraft, ...draftActions } = useRecipeDraft()
  const { setThumbnailUrl } = draftActions
  const tags = useRecipeTags(recipe, allTags)
  const notes = useRecipeNotes(recipe, tags.localTags, onUpdated)
  const shopping = useShoppingListActions(recipe, unitSystem, servingScale)
  const deletion = useRecipeDeletion({
    recipe,
    activeHouseholdId,
    onDeleted,
    onClose,
    onBusyChange: (isBusy) => {
      setBusy(isBusy)
      if (isBusy) setError(null)
    },
    onFailed: (message) => {
      setError(message)
      setMode('editing')
    },
  })

  const dirty = useMemo(
    () =>
      Boolean(recipe && draft) &&
      JSON.stringify(draft) !== JSON.stringify(toEditState(recipe!)),
    [draft, recipe]
  )

  const { setLocalTags } = tags
  const { resetNotes } = notes
  const { resetSessionAdded } = shopping

  useEffect(() => {
    if (recipe) {
      setDraft(toEditState(recipe))
      setLocalTags(recipe.tags ?? [])
      resetNotes(recipe.notes ?? '')
      setMode(initialMode ?? 'view')
      setMealPlanOpen(false)
      resetSessionAdded()
      setCheckedIngredients(new Set())
      setError(null)
    }
  }, [recipe?.id, initialMode])

  // Scroll to target step after modal opens (wait for open animation)
  useEffect(() => {
    if (!recipe || !scrollToStep) return
    const timer = setTimeout(() => {
      const el = document.getElementById(
        `timer-step-${scrollToStep.componentIndex}-${scrollToStep.stepIndex}`
      )
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.classList.add('recipe-step-highlight')
      setTimeout(() => el?.classList.remove('recipe-step-highlight'), 1800)
    }, 250)

    return () => clearTimeout(timer)
  }, [recipe?.id, scrollToStep])

  const handleThumbnailFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !recipe) return
      setImgUploading(true)
      try {
        const result = await uploadThumbnail(file, recipe.id)
        setThumbnailUrl(result.url)
      } catch {
        // keep existing thumbnail on failure
      } finally {
        setImgUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [recipe, setThumbnailUrl]
  )

  if (!recipe || !draft) return null
  const r = recipe
  if (
    cookModeOpen &&
    r.components.some((component) => component.steps.length > 0)
  ) {
    return (
      <CookMode
        recipe={r}
        onClose={onCloseCookMode ?? onClose}
        unitSystem={unitSystem}
        servingScale={servingScale}
      />
    )
  }

  const components = r.components as SaveComponent[]

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateRecipe(
        r.id,
        buildRecipeUpdateFromDraft(
          draft,
          r,
          notes.localNotes,
          tags.localTags.map((tag) => tag.id)
        )
      )
      toast.success(t('recipes.recipeUpdated'), { timeout: 3000 })
      onUpdated?.(updated)
      if (updated.servings !== null) setServings(updated.servings)
      setMode('view')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('recipes.failedToSave'))
    } finally {
      setBusy(false)
    }
  }

  const applySubstitutionUpdate = async (
    newComponents: SaveComponent[] | null,
    failureMessage: string
  ) => {
    if (!newComponents) return
    try {
      const updated = await updateRecipe(
        r.id,
        buildRecipeUpdateFromRecipe(r, {
          components: newComponents,
          notes: notes.localNotes.trim() || null,
          tagIds: tags.localTags.map((tag) => tag.id),
        })
      )
      onUpdated?.(updated)
      setDraft(toEditState(updated))
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : failureMessage, {
        timeout: 3000,
      })
    }
  }

  const handleReplaceIngredient = (ci: number, ii: number) =>
    applySubstitutionUpdate(
      applyIngredientReplace(r.components as SaveComponent[], ci, ii),
      t('recipes.failedToApplySubstitute')
    )

  const handleRestoreIngredient = (ci: number, ii: number) =>
    applySubstitutionUpdate(
      applyIngredientRestore(r.components as SaveComponent[], ci, ii),
      t('recipes.failedToRestoreIngredient')
    )

  const handleToggleFavourite = async () => {
    if (favouritePendingRef.current) return
    favouritePendingRef.current = true
    setLocalFavourite(!(localFavourite ?? r.is_favourite))
    try {
      const result = await toggleFavourite(r.id)
      setLocalFavourite(result.is_favourite)
      onUpdated?.({ ...r, is_favourite: result.is_favourite })
    } catch {
      setLocalFavourite(null)
      toast.danger(t('recipes.failedToSave'), { timeout: 3000 })
    } finally {
      favouritePendingRef.current = false
    }
  }

  const handleDecreaseServings = () => {
    if (selectedServings !== null)
      setServings(Math.max(1, selectedServings - 1))
  }

  const handleIncreaseServings = () => {
    if (selectedServings !== null)
      setServings(Math.min(99, selectedServings + 1))
  }

  const handleToggleIngredient = (key: string) => {
    setCheckedIngredients((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)

      return next
    })
  }

  const cancelMode = () => {
    if (mode === 'editing') setDraft(toEditState(r))
    setMode('view')
    setError(null)
  }

  const handleCancelDelete = () => {
    setMode('editing')
    setError(null)
  }

  const handleClose = () => {
    if (isExiting) return
    onClose()
  }

  const handleModalOpenChange = (open: boolean) => {
    if (!open) handleClose()
  }

  const openCookMode = onOpenCookMode ?? (() => {})
  const openMealPlan = () => setMealPlanOpen(true)
  const enterEditMode = () => setMode('editing')

  const viewLayout = mode === 'view'
  const viewContent = (
    <RecipeViewLayout
      key={r.id}
      recipe={{ ...r, is_favourite: localFavourite ?? r.is_favourite }}
      components={components}
      unitSystem={unitSystem}
      servingScale={servingScale}
      selectedServings={selectedServings}
      onDecreaseServings={handleDecreaseServings}
      onIncreaseServings={handleIncreaseServings}
      tags={tags.localTags}
      wakeLockActive={wakeLock.active}
      onToggleWakeLock={wakeLock.toggle}
      activeAllergens={activeAllergens}
      sessionAdded={shopping.sessionAdded}
      checkedIngredients={checkedIngredients}
      onToggleIngredient={handleToggleIngredient}
      onReplaceIngredient={handleReplaceIngredient}
      onRestoreIngredient={handleRestoreIngredient}
      onAddAllIngredients={shopping.handleAddAllUnifiedIngredients}
      onAddIngredient={shopping.handleAddIngredient}
      onToggleFavourite={handleToggleFavourite}
      onEdit={enterEditMode}
      onOpenMealPlan={openMealPlan}
      onOpenCookMode={openCookMode}
      onClose={handleClose}
      banners={<RecipeNotices recipe={r} error={error} hideAllergenNotice />}
      onOpenRecipe={onOpenRecipe}
      notes={notes.localNotes}
      onNotesChange={notes.setLocalNotes}
      onNotesBlur={notes.handleNotesSave}
      renderRelated={(desktop) => (
        <PopupRelatedSection
          recipeId={r.id}
          onOpen={(id) => onOpenRecipe?.(id)}
          desktop={desktop}
        />
      )}
    />
  )

  const linkedToActiveHousehold =
    !!activeHouseholdId && r.household_ids.includes(activeHouseholdId)
  const activeHousehold = households.find(
    (household) => household.id === activeHouseholdId
  )
  const isAuthor = !!user && r.author_id === user.id
  const editContent = (
    <RecipeEditLayout
      key={r.id}
      recipe={r}
      draft={draft}
      draftActions={draftActions}
      dirty={dirty}
      busy={busy}
      error={error}
      confirmingDelete={mode === 'confirming'}
      canDelete={linkedToActiveHousehold || isAuthor}
      householdName={
        linkedToActiveHousehold ? (activeHousehold?.name ?? null) : null
      }
      isAuthor={isAuthor}
      tags={tags.localTags}
      allTags={allTags}
      onTagAdd={tags.handleTagAdd}
      onTagRemove={tags.handleTagRemove}
      onTagCreate={tags.handleTagCreate}
      fileInputRef={fileInputRef}
      imgUploading={imgUploading}
      notes={notes.localNotes}
      onNotesChange={notes.setLocalNotes}
      onNotesBlur={notes.handleNotesSave}
      onSave={handleSave}
      onCancel={cancelMode}
      onRequestDelete={() => setMode('confirming')}
      onCancelDelete={handleCancelDelete}
      onRemoveFromHousehold={deletion.handleRemoveFromHousehold}
      onDeleteEverywhere={deletion.handleDeleteEverywhere}
      renderRelated={(desktop) => (
        <PopupRelatedSection
          recipeId={r.id}
          onOpen={(id) => onOpenRecipe?.(id)}
          desktop={desktop}
        />
      )}
    />
  )

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleThumbnailFile}
      />
      <Modal isOpen={!!recipe} onOpenChange={handleModalOpenChange}>
        <ModalContainer
          size="lg"
          scroll="inside"
          className="!rounded-none lg:!rounded-[20px] overflow-hidden"
        >
          <ModalDialog className="!p-0 !w-screen !max-w-none !h-dvh !max-h-none !rounded-none lg:!w-[min(1120px,calc(100vw-3rem))] lg:!max-w-[1120px] lg:!h-[min(820px,calc(100dvh-2rem))] lg:!rounded-[20px]">
            <ModalBody className="!p-0 !overflow-hidden min-h-0 flex-1">
              {viewLayout ? viewContent : editContent}
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </Modal>
      <AssignToMealPlanModal
        isOpen={mealPlanOpen}
        onClose={() => setMealPlanOpen(false)}
        recipeId={r.id}
      />
    </>
  )
}

export default RecipeDetailModal
