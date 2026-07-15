import { useTranslation } from 'react-i18next'
import {
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalHeader,
} from '@heroui/react'
import type { MealPlanEntry } from '@carrot/shared/types'
import { proxyUrl } from '../../utils/imageUtils'
import { formatMacroSummary } from './helpers'
import RecipeThumb from './RecipeThumb'

interface DayActionModalProps {
  entry: MealPlanEntry | null
  isOpen: boolean
  onClose: () => void
  busy: boolean
  onViewRecipe: () => void
  onChangeRecipe: () => void
  onRemove: () => void
}

const DayActionModal = ({
  entry,
  isOpen,
  onClose,
  busy,
  onViewRecipe,
  onChangeRecipe,
  onRemove,
}: DayActionModalProps) => {
  const { t } = useTranslation()
  if (!entry) return null

  const entryTitle = entry.recipe?.title ?? entry.text ?? ''
  const thumb = entry.recipe ? proxyUrl(entry.recipe.thumbnail_url) : null
  const macroSummary = entry.recipe ? formatMacroSummary(entry.recipe) : null

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
          <ModalDialog>
            <ModalHeader className="flex items-center gap-3 pb-2">
              {thumb ? (
                <RecipeThumb
                  src={thumb}
                  alt={entryTitle}
                  className="w-12 h-12 rounded-xl shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-zinc-100 shrink-0 flex items-center justify-center text-xl">
                  🍽
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold line-clamp-2 leading-snug">
                  {entryTitle}
                </p>
                {macroSummary && (
                  <p className="text-xs text-zinc-400 mt-0.5">{macroSummary}</p>
                )}
              </div>
            </ModalHeader>
            <ModalBody className="pt-0 pb-4">
              <div className="flex flex-col gap-2">
                {entry.recipe && (
                  <Button
                    variant="secondary"
                    fullWidth
                    className="!rounded-lg"
                    onPress={onViewRecipe}
                  >
                    {t('mealPlan.viewRecipe')}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  fullWidth
                  className="!rounded-lg"
                  onPress={onChangeRecipe}
                >
                  {entry.recipe
                    ? t('mealPlan.changeRecipe')
                    : t('mealPlan.changeMeal')}
                </Button>
                <Button
                  variant="danger-soft"
                  fullWidth
                  className="!rounded-lg"
                  isDisabled={busy}
                  onPress={onRemove}
                >
                  {t('mealPlan.removeFromPlan')}
                </Button>
              </div>
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default DayActionModal
