import { useCallback, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import type { HouseholdOut, RecipeOut } from '@carrot/shared/types'
import { getFullDeleteLabel } from '@carrot/shared/utils/recipeDeleteLabels'

export const useMyRecipeActions = (activeHousehold: HouseholdOut | null) => {
  const { t } = useTranslation()
  const api = useApiClient()
  const qc = useQueryClient()
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
  const inFlightRef = useRef(new Set<string>())

  const removeFromCache = useCallback(
    (id: string) => {
      qc.setQueryData<RecipeOut[]>(['recipes', 'mine'], (old = []) => old.filter((recipe) => recipe.id !== id))
    },
    [qc],
  )

  const runExclusive = useCallback(
    async (recipe: RecipeOut, action: () => Promise<unknown>) => {
      if (inFlightRef.current.has(recipe.id)) return

      inFlightRef.current.add(recipe.id)
      setBusyIds(new Set(inFlightRef.current))

      try {
        await action()
        await qc.invalidateQueries({ queryKey: ['recipes', 'mine'] })
        removeFromCache(recipe.id)
      } catch (e) {
        Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('recipes.failedToDelete'))
      } finally {
        inFlightRef.current.delete(recipe.id)
        setBusyIds(new Set(inFlightRef.current))
      }
    },
    [qc, removeFromCache, t],
  )

  const confirmDelete = useCallback(
    (recipe: RecipeOut) => {
      const activeId = activeHousehold?.id
      const linkedToActiveHousehold = !!activeId && recipe.household_ids.includes(activeId)
      const buttons: Parameters<typeof Alert.alert>[2] = [{ text: t('common.cancel'), style: 'cancel' }]

      if (linkedToActiveHousehold && activeHousehold) {
        buttons.push({
          text: t('recipes.deleteFromHousehold', { name: activeHousehold.name }),
          style: 'destructive',
          onPress: () => void runExclusive(recipe, () => api.removeRecipeFromHousehold(recipe.id, activeHousehold.id)),
        })
      }
      buttons.push({
        text: getFullDeleteLabel(t, linkedToActiveHousehold ? activeHousehold?.name : null),
        style: 'destructive',
        onPress: () => void runExclusive(recipe, () => api.deleteRecipe(recipe.id)),
      })

      Alert.alert(t('recipes.deleteTitle'), t('recipes.deleteConfirm', { title: recipe.title }), buttons)
    },
    [t, activeHousehold, api, runExclusive],
  )

  return { busyIds, confirmDelete }
}
