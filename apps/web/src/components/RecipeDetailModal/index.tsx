import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShoppingList } from '@carrot/shared/hooks/useShoppingList'
import { usePreferences, useRecipeServingPreference } from '@carrot/shared/hooks/usePreferences'
import { useTags } from '@carrot/shared/hooks/useTags'
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalBody,
  ModalFooter,
  toast,
} from '@heroui/react'
import type { RecipeOut, SaveComponent, ShoppingListItemInput, Tag } from '@carrot/shared/types'
import {
  addTagToRecipe,
  deleteRecipe,
  removeRecipeFromHousehold,
  removeTagFromRecipe,
  setRecipeHouseholds,
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
  getShoppingListIngredient,
  toEditState,
  type EditState,
  type Mode,
} from './helpers'
import { useScreenWakeLock } from './useScreenWakeLock'
import RecipeHeroSection from './RecipeHeroSection'
import RecipeMetaBar from './RecipeMetaBar'
import RecipeNotesSection from './RecipeNotesSection'
import RelatedRecipesSection from './RelatedRecipesSection'
import RecipeModalFooter from './RecipeModalFooter'
import ViewComponent from './ViewComponent'
import UnifiedIngredientList from './UnifiedIngredientList'
import EditComponent from './EditComponent'
import CookMode from './CookMode'

interface RecipeDetailModalProps {
  recipe: RecipeOut | null
  allTags: Tag[]
  onClose: () => void
  onUpdated?: (r: RecipeOut) => void
  onDeleted?: (id: string) => void
  onOpenRecipe?: (id: string) => void
  initialMode?: Mode
  activeAllergens?: string[]
  scrollToStep?: { componentIndex: number; stepIndex: number } | null
}

const RecipeDetailModal = ({
  recipe,
  allTags,
  onClose,
  onUpdated,
  onDeleted,
  onOpenRecipe,
  initialMode,
  activeAllergens = [],
  scrollToStep,
}: RecipeDetailModalProps) => {
  const { t } = useTranslation()
  const wakeLock = useScreenWakeLock(Boolean(recipe))
  const { addItems: addShoppingListItems } = useShoppingList()
  const { preferences } = usePreferences()
  const { user } = useAuth()
  const { households, activeHouseholdId } = useHousehold()
  const { create: createTagMutation } = useTags()
  const [mode, setMode] = useState<Mode>('view')
  const [addMode, setAddMode] = useState(false)
  const [mealPlanOpen, setMealPlanOpen] = useState(false)
  const [sessionAdded, setSessionAdded] = useState<Set<string>>(new Set())
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(
    new Set()
  )
  const [draft, setDraft] = useState<EditState | null>(null)
  const [localTags, setLocalTags] = useState<Tag[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imgUploading, setImgUploading] = useState(false)
  const [localNotes, setLocalNotes] = useState(recipe?.notes ?? '')
  const [notesSaving, setNotesSaving] = useState(false)
  const [fontSizeIndex, setFontSizeIndex] = useState(2)
  const [cookModeOpen, setCookModeOpen] = useState(false)
  const savedNotesRef = useRef(recipe?.notes ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const originalServings = recipe?.servings ?? null
  const { selectedServings, setServings } = useRecipeServingPreference(
    recipe?.id,
    originalServings,
  )

  useEffect(() => {
    if (recipe) {
      setDraft(toEditState(recipe))
      setLocalTags(recipe.tags ?? [])
      setLocalNotes(recipe.notes ?? '')
      savedNotesRef.current = recipe.notes ?? ''
      setMode(initialMode ?? 'view')
      setAddMode(false)
      setMealPlanOpen(false)
      setSessionAdded(new Set())
      setCheckedIngredients(new Set())
      setError(null)
      setCookModeOpen(false)
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
        setDraft((d) => (d ? { ...d, thumbnail_url: result.url } : d))
      } catch {
        // keep existing thumbnail on failure
      } finally {
        setImgUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [recipe]
  )

  const handleTagCreate = useCallback(
    async (name: string): Promise<Tag> => createTagMutation.mutateAsync(name),
    [createTagMutation]
  )

  if (!recipe || !draft) return null
  const r = recipe
  if (cookModeOpen) {
    return <CookMode recipe={r} onClose={() => setCookModeOpen(false)} />
  }
  const servingScale =
    r.servings && selectedServings ? selectedServings / r.servings : 1

  const components =
    mode === 'editing' ? draft.components : (r.components as SaveComponent[])
  const single = components.length === 1

  const setIngredient = (ci: number, ii: number, val: string) => {
    setDraft((d) => {
      if (!d) return d
      const comps = d.components.map((c, ci2) =>
        ci2 !== ci
          ? c
          : {
              ...c,
              ingredients: c.ingredients.map((v, ii2) =>
                ii2 === ii ? val : v
              ),
            }
      )

      return { ...d, components: comps }
    })
  }

  const setStep = (ci: number, si: number, val: string) => {
    setDraft((d) => {
      if (!d) return d
      const comps = d.components.map((c, ci2) =>
        ci2 !== ci
          ? c
          : { ...c, steps: c.steps.map((s, si2) => (si2 === si ? val : s)) }
      )

      return { ...d, components: comps }
    })
  }

  const handleTagAdd = async (tag: Tag) => {
    setLocalTags((prev) => [...prev, tag])
    try {
      await addTagToRecipe(r.id, tag.id)
    } catch {
      setLocalTags((prev) => prev.filter((existing) => existing.id !== tag.id))
    }
  }

  const handleTagRemove = async (tagId: string) => {
    setLocalTags((prev) => prev.filter((tag) => tag.id !== tagId))
    try {
      await removeTagFromRecipe(r.id, tagId)
    } catch {
      const removed = allTags.find((tag) => tag.id === tagId)
      if (removed) setLocalTags((prev) => [...prev, removed])
    }
  }
  const handleNotesSave = async () => {
    const trimmed = localNotes.trim()
    if (trimmed === savedNotesRef.current.trim()) return
    setNotesSaving(true)
    try {
      const updated = await updateRecipe(
        r.id,
        buildRecipeUpdateFromRecipe(r, {
          components: r.components as SaveComponent[],
          notes: trimmed || null,
          tagIds: localTags.map((tag) => tag.id),
        })
      )
      savedNotesRef.current = trimmed
      onUpdated?.(updated)
    } catch {
      // silent — user can retry by editing again
    } finally {
      setNotesSaving(false)
    }
  }

  const handleSave = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const updated = await updateRecipe(
        r.id,
        buildRecipeUpdateFromDraft(
          draft,
          r,
          localNotes,
          localTags.map((tag) => tag.id)
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
          notes: localNotes.trim() || null,
          tagIds: localTags.map((tag) => tag.id),
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

  const handleDeleteEverywhere = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteRecipe(r.id)
      toast.danger(t('recipes.recipeDeleted'), { timeout: 3000 })
      onDeleted?.(r.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('recipes.failedToDelete'))
      setMode('view')
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveFromHousehold = async () => {
    if (!activeHouseholdId) return
    setBusy(true)
    setError(null)
    try {
      await removeRecipeFromHousehold(r.id, activeHouseholdId)
      toast.danger(t('recipes.recipeDeleted'), { timeout: 3000 })
      onDeleted?.(r.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('recipes.failedToDelete'))
      setMode('view')
    } finally {
      setBusy(false)
    }
  }

  const handleHouseholdsChange = async (householdIds: string[]) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await setRecipeHouseholds(r.id, householdIds)
      onUpdated?.(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('recipes.failedToSave'))
    } finally {
      setBusy(false)
    }
  }

  const handleToggleFavourite = async () => {
    try {
      const result = await toggleFavourite(r.id)
      onUpdated?.({ ...r, is_favourite: result.is_favourite })
    } catch {
      toast.danger(t('recipes.failedToSave'), { timeout: 3000 })
    }
  }

  const handleDecreaseServings = () => {
    if (selectedServings !== null) setServings(Math.max(1, selectedServings - 1))
  }

  const handleIncreaseServings = () => {
    if (selectedServings !== null) setServings(Math.min(99, selectedServings + 1))
  }

  const handleAddIngredient = (ci: number, ii: number) => {
    const comp = (r.components as SaveComponent[])[ci]
    const text = getShoppingListIngredient(
      comp,
      ii,
      preferences?.unit_system ?? 'metric',
      servingScale
    )
    const item: ShoppingListItemInput = {
      text,
      category: comp.shopping_list_categories?.[ii] ?? 'other',
    }
    addShoppingListItems.mutate([item])
    setSessionAdded((prev) => new Set(prev).add(`${ci}-${ii}`))
  }

  const handleAddAllIngredients = (ci: number) => {
    const comp = (r.components as SaveComponent[])[ci]
    const keys: string[] = []
    const items: ShoppingListItemInput[] = []
    comp.ingredients.forEach((_, ii) => {
      const key = `${ci}-${ii}`
      if (!sessionAdded.has(key)) {
        keys.push(key)
        const text = getShoppingListIngredient(
          comp,
          ii,
          preferences?.unit_system ?? 'metric',
          servingScale
        )
        items.push({ text, category: comp.shopping_list_categories?.[ii] ?? 'other' })
      }
    })
    if (items.length === 0) return
    addShoppingListItems.mutate(items)
    setSessionAdded((prev) => new Set([...prev, ...keys]))
  }

  const handleAddAllUnifiedIngredients = () => {
    components.forEach((_, componentIndex) =>
      handleAddAllIngredients(componentIndex)
    )
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

  const handleClose = () => {
    setMode('view')
    setError(null)
    onClose()
  }

  const handleModalOpenChange = (open: boolean) => {
    if (!open) handleClose()
  }

  return (
    <>
      <Modal isOpen={!!recipe} onOpenChange={handleModalOpenChange}>
        <ModalBackdrop isDismissable>
          <ModalContainer
            size="lg"
            scroll="inside"
            className="!rounded-xl overflow-hidden"
          >
            <ModalDialog className="!max-w-[712px] !p-0 max-h-[calc(100dvh-2rem)] sm:max-h-[1000px] rounded-xl">
              <ModalHeader className="flex-col gap-0 p-0">
                <RecipeHeroSection
                  recipe={r}
                  draft={draft}
                  mode={mode}
                  onTitleChange={(v) =>
                    setDraft((d) => (d ? { ...d, title: v } : d))
                  }
                  localTags={localTags}
                  allTags={allTags}
                  onTagAdd={handleTagAdd}
                  onTagRemove={handleTagRemove}
                  onTagCreate={handleTagCreate}
                  fileInputRef={fileInputRef}
                  onThumbnailFile={handleThumbnailFile}
                  imgUploading={imgUploading}
                  addMode={addMode}
                  onToggleAddMode={() => setAddMode((v) => !v)}
                  onOpenMealPlan={() => setMealPlanOpen(true)}
                  onToggleFavourite={handleToggleFavourite}
                  onEdit={() => setMode('editing')}
                  onDelete={() => setMode('confirming')}
                />
              </ModalHeader>

              <ModalBody className="!px-0 !pb-5 !pt-0">
                <RecipeMetaBar
                  recipe={r}
                  draft={draft}
                  mode={mode}
                  onNutritionChange={(field, value) =>
                    setDraft((d) => d && { ...d, [field]: value })
                  }
                  wakeLockActive={wakeLock.active}
                  onToggleWakeLock={wakeLock.toggle}
                  fontSizeIndex={fontSizeIndex}
                  onFontSizeChange={setFontSizeIndex}
                  onCancelMode={cancelMode}
                  selectedServings={selectedServings}
                  onDecreaseServings={handleDecreaseServings}
                  onIncreaseServings={handleIncreaseServings}
                  onOpenCookMode={() => setCookModeOpen(true)}
                />

                <div className="px-10">
                  {error && (
                    <div className="bg-danger-50 text-danger rounded-lg p-3 text-sm mb-3">
                      {error}
                    </div>
                  )}

                  <RelatedRecipesSection
                    recipeId={r.id}
                    onOpen={(id) => onOpenRecipe?.(id)}
                  />

                  <RecipeNotesSection
                    value={localNotes}
                    onChange={setLocalNotes}
                    onBlur={handleNotesSave}
                    saving={notesSaving}
                    fontSizeIndex={fontSizeIndex}
                  />

                  {mode !== 'editing' && components.length > 0 && (
                    <UnifiedIngredientList
                      components={components}
                      unitSystem={preferences?.unit_system ?? 'metric'}
                      servingScale={servingScale}
                      activeAllergens={activeAllergens}
                      addMode={addMode}
                      sessionAdded={sessionAdded}
                      checkedIngredients={checkedIngredients}
                      onToggleIngredient={handleToggleIngredient}
                      onReplaceIngredient={handleReplaceIngredient}
                      onRestoreIngredient={handleRestoreIngredient}
                      onAddIngredient={handleAddIngredient}
                      onAddAllIngredients={handleAddAllUnifiedIngredients}
                      fontSizeIndex={fontSizeIndex}
                    />
                  )}

                  {mode === 'editing'
                    ? components.map((comp, ci) => (
                        <EditComponent
                          key={ci}
                          comp={comp}
                          single={single}
                          onIngredientChange={(ii, val) =>
                            setIngredient(ci, ii, val)
                          }
                          onStepChange={(si, val) => setStep(ci, si, val)}
                        />
                      ))
                    : components.map((comp, ci) => (
                        <ViewComponent
                          key={ci}
                          comp={comp}
                          unitSystem={preferences?.unit_system ?? 'metric'}
                          single={single}
                          activeAllergens={activeAllergens}
                          onReplaceIngredient={(ii) =>
                            handleReplaceIngredient(ci, ii)
                          }
                          onRestoreIngredient={(ii) =>
                            handleRestoreIngredient(ci, ii)
                          }
                          recipeId={r.id}
                          recipeTitle={r.title}
                          componentIndex={ci}
                          addMode={addMode}
                          sessionAdded={sessionAdded}
                          checkedIngredients={checkedIngredients}
                          onToggleIngredient={handleToggleIngredient}
                          onAddIngredient={(ii) => handleAddIngredient(ci, ii)}
                          onAddAllIngredients={() =>
                            handleAddAllIngredients(ci)
                          }
                          fontSizeIndex={fontSizeIndex}
                          servingScale={servingScale}
                          collapsible={components.length > 1 && ci > 0}
                          showIngredients={components.length > 1}
                          showGroupHeader={components.length > 1}
                        />
                      ))}
                </div>
              </ModalBody>

              <ModalFooter className="flex-col gap-2 items-stretch px-10 pb-5 pt-3">
                <RecipeModalFooter
                  recipe={r}
                  mode={mode}
                  busy={busy}
                  isAuthor={!!user && r.author_id === user.id}
                  households={households}
                  activeHouseholdId={activeHouseholdId}
                  onHouseholdsChange={handleHouseholdsChange}
                  onCancel={cancelMode}
                  onSave={handleSave}
                  onRemoveFromHousehold={handleRemoveFromHousehold}
                  onDeleteEverywhere={handleDeleteEverywhere}
                  onClose={handleClose}
                />
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
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
