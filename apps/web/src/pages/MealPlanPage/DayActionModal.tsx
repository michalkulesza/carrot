import { useState } from 'react'
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
  onMoveEntry: (to: string) => void
}

const DayActionModal = ({
  entry,
  isOpen,
  onClose,
  busy,
  onViewRecipe,
  onChangeRecipe,
  onRemove,
  onMoveEntry,
}: DayActionModalProps) => {
  const { t } = useTranslation()
  const [isMovePickerOpen, setIsMovePickerOpen] = useState(false)
  const [moveToDate, setMoveToDate] = useState('')

  if (!entry) return null

  const entryTitle = entry.recipe?.title ?? entry.text ?? ''
  const thumb = entry.recipe ? proxyUrl(entry.recipe.thumbnail_url) : null
  const macroSummary = entry.recipe ? formatMacroSummary(entry.recipe) : null

  const openMovePicker = () => {
    setMoveToDate(entry.date)
    setIsMovePickerOpen(true)
  }

  const confirmMove = () => {
    if (!moveToDate || moveToDate === entry.date) return
    onMoveEntry(moveToDate)
    setIsMovePickerOpen(false)
  }

  const handleOpenChange = (open: boolean) => {
    if (open) return
    setIsMovePickerOpen(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
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
                {isMovePickerOpen ? (
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={moveToDate}
                      onChange={(e) => setMoveToDate(e.target.value)}
                      aria-label={t('mealPlan.moveTo')}
                      className="flex-1 min-w-0 rounded-lg border border-zinc-200 px-2 text-sm"
                    />
                    <Button
                      variant="secondary"
                      className="!rounded-lg"
                      isDisabled={
                        busy || !moveToDate || moveToDate === entry.date
                      }
                      onPress={confirmMove}
                    >
                      {t('mealPlan.moveTo')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    fullWidth
                    className="!rounded-lg"
                    onPress={openMovePicker}
                  >
                    {t('mealPlan.moveTo')}
                  </Button>
                )}
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
