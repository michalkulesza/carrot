import { useTranslation } from 'react-i18next'
import { Button } from '@heroui/react'
import type { HouseholdOut, RecipeOut } from '@carrot/shared/types'
import type { Mode } from './helpers'
import RecipeHouseholdsPicker from './RecipeHouseholdsPicker'

interface RecipeModalFooterProps {
  recipe: RecipeOut
  mode: Mode
  busy: boolean
  isAuthor: boolean
  households: HouseholdOut[]
  activeHouseholdId: string | null
  onHouseholdsChange: (householdIds: string[]) => void
  onCancel: () => void
  onSave: () => void
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
  onHouseholdsChange,
  onCancel,
  onSave,
  onRemoveFromHousehold,
  onDeleteEverywhere,
  onClose,
}: RecipeModalFooterProps) => {
  const { t } = useTranslation()
  const linkedToActiveHousehold =
    !!activeHouseholdId && recipe.household_ids.includes(activeHouseholdId)
  const activeHousehold = households.find((h) => h.id === activeHouseholdId)

  return (
    <>
      {mode !== 'confirming' && (
        <RecipeHouseholdsPicker
          households={households}
          householdIds={recipe.household_ids}
          busy={busy}
          onChange={onHouseholdsChange}
        />
      )}
      <div className="flex justify-end gap-2">
        {mode === 'editing' && (
          <>
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
            <Button variant="tertiary" onPress={onCancel} isDisabled={busy}>
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
