import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, toast } from '@heroui/react'
import type { HouseholdOut, RecipeOut } from '@carrot/shared/types'
import {
  deleteRecipe,
  removeRecipeFromHousehold,
  setRecipeHouseholds,
} from '../../api/client'
import HouseholdAvatarIndicators from '../../components/HouseholdAvatarIndicators'
import RecipeHouseholdsPicker from '../../components/RecipeDetailModal/RecipeHouseholdsPicker'
import { proxyUrl } from '../../utils/imageUtils'
import NetworkImage from '../../components/NetworkImage'

interface MyRecipeRowProps {
  recipe: RecipeOut
  households: HouseholdOut[]
  activeHouseholdId: string | null
  onView: (id: string) => void
  onDeleted: (id: string) => void
  onUpdated: (recipe: RecipeOut) => void
}

const MyRecipeRow = ({
  recipe,
  households,
  activeHouseholdId,
  onView,
  onDeleted,
  onUpdated,
}: MyRecipeRowProps) => {
  const { t } = useTranslation()
  const [managingHouseholds, setManagingHouseholds] = useState(false)
  const [busy, setBusy] = useState(false)
  const linkedToActiveHousehold =
    !!activeHouseholdId && recipe.household_ids.includes(activeHouseholdId)
  const activeHousehold = households.find((h) => h.id === activeHouseholdId)

  const handleToggleManageHouseholds = useCallback(
    () => setManagingHouseholds((v) => !v),
    []
  )

  const handleHouseholdsChange = useCallback(
    async (householdIds: string[]) => {
      setBusy(true)
      try {
        const updated = await setRecipeHouseholds(recipe.id, householdIds)
        onUpdated(updated)
      } catch (e) {
        toast.danger(e instanceof Error ? e.message : t('recipes.failedToSave'), {
          timeout: 3000,
        })
      } finally {
        setBusy(false)
      }
    },
    [recipe.id, onUpdated, t]
  )

  const handleRemoveFromHousehold = useCallback(async () => {
    if (!activeHouseholdId) return
    setBusy(true)
    try {
      await removeRecipeFromHousehold(recipe.id, activeHouseholdId)
      toast.danger(t('recipes.recipeDeleted'), { timeout: 3000 })
      onDeleted(recipe.id)
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : t('recipes.failedToDelete'), {
        timeout: 3000,
      })
      setBusy(false)
    }
  }, [recipe.id, activeHouseholdId, onDeleted, t])

  const handleDeleteEverywhere = useCallback(async () => {
    setBusy(true)
    try {
      await deleteRecipe(recipe.id)
      toast.danger(t('recipes.recipeDeleted'), { timeout: 3000 })
      onDeleted(recipe.id)
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : t('recipes.failedToDelete'), {
        timeout: 3000,
      })
      setBusy(false)
    }
  }, [recipe.id, onDeleted, t])

  const handleView = useCallback(() => onView(recipe.id), [onView, recipe.id])

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {recipe.thumbnail_url && (
          <NetworkImage
            src={proxyUrl(recipe.thumbnail_url)!}
            alt=""
            className="w-10 h-10 rounded-lg shrink-0 object-cover"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{recipe.title}</p>
          <HouseholdAvatarIndicators recipe={recipe} size="sm" className="mt-1" />
        </div>
        <Button size="sm" variant="secondary" onPress={handleView}>
          {t('common.view')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="tertiary"
          isDisabled={busy}
          onPress={handleToggleManageHouseholds}
        >
          {t('recipes.addToHousehold')}
        </Button>
        {linkedToActiveHousehold && activeHousehold && (
          <Button
            size="sm"
            variant="danger-soft"
            isDisabled={busy}
            onPress={handleRemoveFromHousehold}
          >
            {t('recipes.deleteFromHousehold', { name: activeHousehold.name })}
          </Button>
        )}
        <Button
          size="sm"
          variant="danger-soft"
          isDisabled={busy}
          onPress={handleDeleteEverywhere}
        >
          {t('recipes.deleteEverywhere')}
        </Button>
      </div>

      {managingHouseholds && (
        <RecipeHouseholdsPicker
          households={households}
          householdIds={recipe.household_ids}
          busy={busy}
          onChange={handleHouseholdsChange}
        />
      )}
    </li>
  )
}

export default MyRecipeRow
