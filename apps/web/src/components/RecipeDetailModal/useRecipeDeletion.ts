import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '@heroui/react'
import type { RecipeOut } from '@carrot/shared/types'
import { deleteRecipe, removeRecipeFromHousehold } from '../../api/client'

interface UseRecipeDeletionOptions {
  recipe: RecipeOut | null
  activeHouseholdId: string | null
  onDeleted?: (id: string) => void
  onClose: () => void
  onBusyChange: (busy: boolean) => void
  onFailed: (message: string) => void
}

export const useRecipeDeletion = ({
  recipe,
  activeHouseholdId,
  onDeleted,
  onClose,
  onBusyChange,
  onFailed,
}: UseRecipeDeletionOptions) => {
  const { t } = useTranslation()
  const deletePendingRef = useRef(false)

  const runDeletion = async (
    remove: (recipeId: string) => Promise<unknown>
  ) => {
    if (!recipe || deletePendingRef.current) return
    deletePendingRef.current = true
    onBusyChange(true)
    try {
      await remove(recipe.id)
      toast.danger(t('recipes.recipeDeleted'), { timeout: 3000 })
      onDeleted?.(recipe.id)
      onClose()
    } catch (err) {
      onFailed(err instanceof Error ? err.message : t('recipes.failedToDelete'))
    } finally {
      deletePendingRef.current = false
      onBusyChange(false)
    }
  }

  const handleDeleteEverywhere = () => runDeletion(deleteRecipe)

  const handleRemoveFromHousehold = () => {
    if (!activeHouseholdId) return Promise.resolve()

    return runDeletion((recipeId) =>
      removeRecipeFromHousehold(recipeId, activeHouseholdId)
    )
  }

  return { handleDeleteEverywhere, handleRemoveFromHousehold }
}
