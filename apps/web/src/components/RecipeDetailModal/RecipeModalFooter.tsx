import { useTranslation } from 'react-i18next'
import { Button, Switch } from '@heroui/react'
import type { RecipeOut } from '@carrot/shared/types'
import type { Mode } from './helpers'

interface RecipeModalFooterProps {
  recipe: RecipeOut
  mode: Mode
  busy: boolean
  sharedToPersonal: boolean
  onSharedToPersonalChange: (v: boolean) => void
  onCancel: () => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}

const RecipeModalFooter = ({
  recipe,
  mode,
  busy,
  sharedToPersonal,
  onSharedToPersonalChange,
  onCancel,
  onSave,
  onDelete,
  onClose,
}: RecipeModalFooterProps) => {
  const { t } = useTranslation()

  return (
    <>
      {mode === 'editing' && recipe.household_id && (
        <div className="flex items-center justify-between px-1">
          <span className="text-sm text-zinc-600">
            {t('recipes.alsoInPrivate')}
          </span>
          <Switch
            size="sm"
            isSelected={sharedToPersonal}
            onChange={onSharedToPersonalChange}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        </div>
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
            <Button variant="danger" onPress={onDelete} isDisabled={busy}>
              {t('common.delete')}
            </Button>
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
