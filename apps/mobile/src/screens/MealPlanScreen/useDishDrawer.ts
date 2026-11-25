import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { useMealPlanMutations } from '@carrot/shared/hooks/useMealPlanMutations'
import { useRecipes } from '@carrot/shared/hooks/useRecipes'
import type { MealPlanEntry, MealPlanItemInput } from '@carrot/shared/types'
import { useDrawerSearch } from '../../components/SelectionDrawer'

export type DishSelection = { kind: 'recipe'; id: string } | { kind: 'quick'; text: string }

export const getSelectionKey = (item: DishSelection): string =>
  item.kind === 'recipe' ? `recipe:${item.id}` : `quick:${item.text.toLowerCase()}`

export const useDishDrawer = (dateIso: string | null, existingEntries: MealPlanEntry[], onClose: () => void) => {
  const { t } = useTranslation()
  const { recipes } = useRecipes()
  const { addEntries } = useMealPlanMutations()
  const { query, setQuery, trimmed, normalized } = useDrawerSearch()

  const [selection, setSelection] = useState<DishSelection[]>([])
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const { mutateAsync: addEntriesAsync } = addEntries

  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes])
  const recipeTitles = useMemo(() => new Set(recipes.map((recipe) => recipe.title.trim().toLowerCase())), [recipes])

  const existingRecipeIds = useMemo(
    () => new Set(existingEntries.flatMap((entry) => (entry.recipe ? [entry.recipe.id] : []))),
    [existingEntries],
  )

  const selectedRecipeIds = useMemo(
    () => new Set(selection.flatMap((item) => (item.kind === 'recipe' ? [item.id] : []))),
    [selection],
  )

  const alreadyPickedQuick = selection.some((item) => item.kind === 'quick' && item.text.toLowerCase() === normalized)
  const showQuickAdd = !!trimmed && !recipeTitles.has(normalized) && !alreadyPickedQuick

  const handleDismiss = useCallback(() => {
    setSelection([])
    onClose()
  }, [onClose])

  const toggleRecipe = useCallback((id: string) => {
    setSelection((current) =>
      current.some((item) => item.kind === 'recipe' && item.id === id)
        ? current.filter((item) => !(item.kind === 'recipe' && item.id === id))
        : [...current, { kind: 'recipe', id }],
    )
  }, [])

  const addQuickMeal = useCallback(() => {
    setSelection((current) => [...current, { kind: 'quick', text: trimmed }])
    setQuery('')
  }, [trimmed, setQuery])

  const removeItem = useCallback((key: string) => {
    setSelection((current) => current.filter((item) => getSelectionKey(item) !== key))
  }, [])

  const submit = useCallback(async () => {
    if (savingRef.current || !dateIso || selection.length === 0) return

    savingRef.current = true
    setSaving(true)

    const items: MealPlanItemInput[] = selection.map((item) =>
      item.kind === 'recipe' ? { recipeId: item.id, recipe: recipesById.get(item.id) } : { text: item.text },
    )

    try {
      await addEntriesAsync({ date: dateIso, items })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      handleDismiss()
    } catch {
      Alert.alert(t('mealPlan.addFailed'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [dateIso, selection, recipesById, addEntriesAsync, handleDismiss, t])

  return {
    recipes,
    recipesById,
    query,
    setQuery,
    selection,
    selectedRecipeIds,
    existingRecipeIds,
    showQuickAdd,
    trimmedQuery: trimmed,
    saving,
    handleDismiss,
    toggleRecipe,
    addQuickMeal,
    removeItem,
    submit,
  }
}
