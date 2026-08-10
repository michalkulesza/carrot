import { useTranslation } from 'react-i18next'
import { Button } from '@heroui/react'
import type { HouseholdOut, RecipeOut } from '@carrot/shared/types'
import type { Mode } from './helpers'

interface RecipeModalFooterProps {
  recipe: RecipeOut
  mode: Mode
  busy: boolean
  isAuthor: boolean
  households: HouseholdOut[]
  activeHouseholdId: string | null
  onCancel: () => void
  onCancelDelete: () => void
  onSave: () => void
  onRequestDelete: () => void
  onRemoveFromHousehold: () => void
  onDeleteEverywhere: () => void
  onClose: () => void
}

const RecipeModalFooter = ({
  recipe,
  mode,
  busy,
  isAuthor,
  households,
  activeHouseholdId,
  onCancel,
  onCancelDelete,
  onSave,
  onRequestDelete,
  onRemoveFromHousehold,
  onDeleteEverywhere,
  onClose,
}: RecipeModalFooterProps) => {
  const { t } = useTranslation()
  const linkedToActiveHousehold =
    !!activeHouseholdId && recipe.household_ids.includes(activeHouseholdId)
  const activeHousehold = households.find((h) => h.id === activeHouseholdId)
  const canDelete = linkedToActiveHousehold || isAuthor

  return (
    <>
      <div className="flex justify-end gap-2">
        {mode === 'editing' && (
          <>
            {canDelete && (
              <Button
                variant="danger-soft"
                onPress={onRequestDelete}
                isDisabled={busy}
                className="mr-auto"
              >
                {t('recipes.deleteRecipe')}
              </Button>
            )}
            <Button variant="tertiary" onPress={onCancel} isDisabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onPress={onSave} isDisabled={busy}>
              {t('common.save')}
            </Button>
          </>
        )}
        {mode === 'confirming' && (
          <>
            <Button
              variant="tertiary"
              onPress={onCancelDelete}
              isDisabled={busy}
            >
              {t('common.cancel')}
            </Button>
            {linkedToActiveHousehold && activeHousehold && (
              <Button
                variant="danger-soft"
                onPress={onRemoveFromHousehold}
                isDisabled={busy}
              >
                {t('recipes.deleteFromHousehold', {
                  name: activeHousehold.name,
                })}
              </Button>
            )}
            {isAuthor && (
              <Button
                variant="danger"
                onPress={onDeleteEverywhere}
                isDisabled={busy}
              >
                {t('recipes.deleteEverywhere')}
              </Button>
            )}
          </>
        )}
        {mode === 'view' && (
          <Button variant="tertiary" onPress={onClose}>
            {t('common.close')}
          </Button>
        )}
      </div>
    </>
  )
}

export default RecipeModalFooter
