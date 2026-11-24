import { useCallback, useRef, useState } from 'react'
import { ActionSheetIOS, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '@carrot/shared/api/context'
import type { RecipeOut } from '@carrot/shared/types'
import { useAuth } from '../../context/AuthContext'
import { useHousehold } from '../../context/HouseholdContext'
import { TOGGLE_HOUSEHOLD_PREFIX } from '../RecipeDetailScreen/useRecipeDetailHeader'

export const useRecipeActions = (getRecipe: (id: string) => RecipeOut | undefined) => {
  const { t } = useTranslation()
  const router = useRouter()
  const api = useApiClient()
  const qc = useQueryClient()
  const { user } = useAuth()
  const { households, activeHouseholdId, activeHousehold } = useHousehold()
  const [favouriteOverrides, setFavouriteOverrides] = useState<Map<string, boolean>>(new Map())
  const pendingFavourites = useRef(new Set<string>())

  const removeFromCache = useCallback(
    async (recipeId: string) => {
      qc.setQueryData<RecipeOut[]>(['recipes'], (old) => old?.filter((r) => r.id !== recipeId) ?? [])
      await qc.invalidateQueries({ queryKey: ['recipes'] })
    },
    [qc],
  )

  const handleConfirmDelete = useCallback(
    async (recipe: RecipeOut) => {
      try {
        await api.deleteRecipe(recipe.id)
        await removeFromCache(recipe.id)
      } catch {
        Alert.alert(t('recipes.failedToDelete'))
      }
    },
    [api, removeFromCache, t],
  )

  const handleConfirmRemoveFromHousehold = useCallback(
    async (recipe: RecipeOut) => {
      if (!activeHouseholdId) return
      try {
        await api.removeRecipeFromHousehold(recipe.id, activeHouseholdId)
        await removeFromCache(recipe.id)
      } catch {
        Alert.alert(t('recipes.failedToDelete'))
      }
    },
    [api, removeFromCache, activeHouseholdId, t],
  )

  const handleDelete = useCallback(
    (recipe: RecipeOut) => {
      const isAuthor = recipe.author_id === user?.id
      const linkedToActiveHousehold = !!activeHouseholdId && recipe.household_ids.includes(activeHouseholdId)

      const buttons: Parameters<typeof Alert.alert>[2] = [{ text: t('common.cancel'), style: 'cancel' }]
      if (linkedToActiveHousehold && activeHousehold) {
        buttons.push({
          text: t('recipes.deleteFromHousehold', { name: activeHousehold.name }),
          style: 'destructive',
          onPress: () => handleConfirmRemoveFromHousehold(recipe),
        })
      }
      if (isAuthor) {
        buttons.push({
          text: t('recipes.deleteEverywhere'),
          style: 'destructive',
          onPress: () => handleConfirmDelete(recipe),
        })
      }

      Alert.alert(t('recipes.deleteTitle'), t('recipes.deleteConfirm', { title: recipe.title }), buttons)
    },
    [handleConfirmDelete, handleConfirmRemoveFromHousehold, user, activeHouseholdId, activeHousehold, t],
  )

  const handleToggleFavourite = useCallback(
    async (recipeId: string) => {
      const recipe = getRecipe(recipeId)
      if (!recipe || pendingFavourites.current.has(recipeId)) return

      pendingFavourites.current.add(recipeId)
      const current = recipe.is_favourite
      setFavouriteOverrides((prev) => new Map(prev).set(recipeId, !current))

      try {
        const result = await api.toggleFavourite(recipeId)
        setFavouriteOverrides((prev) => new Map(prev).set(recipeId, result.is_favourite))
        await qc.invalidateQueries({ queryKey: ['recipes'] })
      } catch {
        setFavouriteOverrides((prev) => new Map(prev).set(recipeId, current))
      } finally {
        pendingFavourites.current.delete(recipeId)
      }
    },
    [api, getRecipe, qc],
  )

  const handleShareAction = useCallback(
    async (item: RecipeOut, shareId: string) => {
      const householdId = shareId.slice(TOGGLE_HOUSEHOLD_PREFIX.length)
      try {
        if (item.household_ids.includes(householdId)) {
          await api.removeRecipeFromHousehold(item.id, householdId)
        } else {
          await api.setRecipeHouseholds(item.id, [...item.household_ids, householdId])
        }
        await qc.invalidateQueries({ queryKey: ['recipes'] })
      } catch (err) {
        Alert.alert(t('common.somethingWentWrong'), err instanceof Error ? err.message : t('addRecipe.failedToAdd'))
      }
    },
    [api, qc, t],
  )

  const handleRecipeLongPress = useCallback(
    (recipeId: string) => {
      const item = getRecipe(recipeId)
      if (!item) return

      const shareActions = households.map((h) => ({
        id: `${TOGGLE_HOUSEHOLD_PREFIX}${h.id}`,
        label: item.household_ids.includes(h.id)
          ? t('recipes.deleteFromHousehold', { name: h.name })
          : `${t('recipes.addToHousehold')}: ${h.name}`,
      }))
      const favouriteLabel = item.is_favourite ? t('recipes.removeFromFavourites') : t('recipes.addToFavourites')
      const labels = [favouriteLabel, t('common.edit'), ...shareActions.map((a) => a.label), t('common.delete')]
      const deleteIndex = labels.length - 1

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...labels, t('common.cancel')],
          destructiveButtonIndex: deleteIndex,
          cancelButtonIndex: labels.length,
        },
        (index) => {
          if (index === 0) {
            void handleToggleFavourite(item.id)
            return
          }
          if (index === 1) {
            router.push({ pathname: '/recipe/[id]', params: { id: item.id, edit: '1' } })
            return
          }
          if (index === deleteIndex) {
            handleDelete(item)
            return
          }
          const share = shareActions[index - 2]
          if (share) void handleShareAction(item, share.id)
        },
      )
    },
    [getRecipe, households, handleToggleFavourite, router, handleDelete, handleShareAction, t],
  )

  return { favouriteOverrides, handleRecipeLongPress, handleToggleFavourite }
}
