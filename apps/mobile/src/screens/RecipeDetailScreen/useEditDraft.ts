import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import type { TFunction } from 'i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@carrot/shared/api/client'
import { getConflictInfo, getErrorStatus } from '@carrot/shared/api/errors'
import type { RecipeOut } from '@carrot/shared/types'
import { buildDraft, buildEditRecipeSaveRequest, type EditDraft } from './helpers'
import { useDraftMutators } from './useDraftMutators'
import { useThumbnailPicker } from './useThumbnailPicker'
import { showRecipeChangedAlert, useRecipeEditLock } from './useRecipeEditLock'

export const useEditDraft = ({
  recipe,
  recipeId,
  autoEditParam,
  api,
  t,
  onSaveSuccess,
  onRecipeRemoved,
}: {
  recipe: RecipeOut | undefined
  recipeId: string
  autoEditParam: string | undefined
  api: ApiClient
  t: TFunction
  onSaveSuccess: (updated: RecipeOut) => void
  onRecipeRemoved: () => void
}) => {
  const qc = useQueryClient()

  const [editing, setEditing] = useState(false)
  const [editPending, setEditPending] = useState(false)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const savedSnapshotRef = useRef('')
  const enterPendingRef = useRef(false)
  const handleThumbnailUploaded = useCallback(
    (url: string) => setDraft((prev) => prev && { ...prev, thumbnail_url: url }),
    [],
  )
  const { uploadingThumb, thumbErrored, setThumbErrored, handlePickThumbnail } = useThumbnailPicker({
    recipeId,
    t,
    onUploaded: handleThumbnailUploaded,
  })
  const {
    updateComp,
    setIngredient,
    setIngredientCategory,
    addIngredient,
    removeIngredient,
    setStep,
    addStep,
    removeStep,
    handleNutritionChange,
    handleServingsChange,
  } = useDraftMutators(setDraft)
  const lock = useRecipeEditLock({ api, recipeId, editing, t })

  const handleEdit = useCallback(async () => {
    if (!recipe || editing || enterPendingRef.current) return
    enterPendingRef.current = true
    setEditPending(true)

    const acquired = await lock.acquire(recipe.edit_version)

    enterPendingRef.current = false
    setEditPending(false)
    if (!acquired) return

    const initial = buildDraft(recipe)
    setDraft(initial)
    savedSnapshotRef.current = JSON.stringify(initial)
    setThumbErrored(false)
    setEditing(true)
  }, [recipe, editing, lock])

  const exitEditing = useCallback(() => {
    setEditing(false)
    lock.release()
  }, [lock])

  const autoEditAppliedRef = useRef(false)
  useEffect(() => {
    if (autoEditParam === '1' && recipe && !autoEditAppliedRef.current) {
      autoEditAppliedRef.current = true
      void handleEdit()
    }
  }, [autoEditParam, recipe, handleEdit])

  const isDirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== savedSnapshotRef.current,
    [draft],
  )

  const handleCancelEdit = useCallback(() => {
    if (saving) return
    if (!isDirty) {
      exitEditing()
      return
    }
    Alert.alert(t('addRecipe.discardChangesTitle'), t('addRecipe.discardChangesMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('addRecipe.discard'), style: 'destructive', onPress: exitEditing },
    ])
  }, [saving, isDirty, exitEditing, t])

  const handleReloadAfterConflict = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['recipes'] })
    exitEditing()
  }, [qc, exitEditing])

  const handleSaveError = useCallback((error: unknown) => {
    const conflict = getConflictInfo(error)

    if (conflict?.code === 'recipe_locked') {
      lock.showLockedAlert(conflict)
      return
    }

    if (conflict?.code === 'recipe_changed') {
      showRecipeChangedAlert(t, handleReloadAfterConflict)
      return
    }

    if (getErrorStatus(error) === 404) {
      onRecipeRemoved()
      return
    }

    lock.reportUnexpectedError(error, 'updateRecipe')
    Alert.alert(t('common.somethingWentWrong'), t('addRecipe.saveError'))
  }, [lock, t, handleReloadAfterConflict, onRecipeRemoved])

  const handleSaveEdit = useCallback(async () => {
    if (!draft || !recipe || saving) return
    setSaving(true)
    try {
      const payload = {
        ...buildEditRecipeSaveRequest(recipe, draft),
        expected_edit_version: lock.expectedVersionRef.current ?? undefined,
      }
      const updated = await api.updateRecipe(recipeId, payload)
      lock.expectedVersionRef.current = updated.edit_version
      qc.setQueryData<RecipeOut[]>(['recipes'], (prev) =>
        prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev,
      )
      void qc.invalidateQueries({ queryKey: ['allergen-recheck-status'] })
      onSaveSuccess(updated)
      exitEditing()
    } catch (error) {
      handleSaveError(error)
    } finally {
      setSaving(false)
    }
  }, [draft, recipe, saving, api, recipeId, qc, lock, onSaveSuccess, exitEditing, handleSaveError])

  return {
    editing,
    draft,
    setDraft,
    saving,
    isDirty,
    uploadingThumb,
    thumbErrored,
    setThumbErrored,
    handleEdit,
    editPending,
    handleCancelEdit,
    handleNutritionChange,
    handleServingsChange,
    updateComp,
    setIngredientCategory,
    setIngredient,
    addIngredient,
    removeIngredient,
    setStep,
    addStep,
    removeStep,
    handlePickThumbnail,
    handleSaveEdit,
  }
}
