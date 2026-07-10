import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from '@heroui/react'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'

interface DeleteRecipeModalProps {
  deleteTarget: RecipeOut | null
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}

const DeleteRecipeModal = ({
  deleteTarget,
  deleting,
  onCancel,
  onConfirm,
}: DeleteRecipeModalProps) => {
  const { t } = useTranslation()

  const handleOpenChange = (open: boolean) => {
    if (!open) onCancel()
  }

  return (
    <Modal isOpen={!!deleteTarget} onOpenChange={handleOpenChange}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl">
          <ModalDialog>
            <ModalHeader className="text-base font-semibold">
              {t('recipes.deleteTitle')}
            </ModalHeader>
            <ModalBody>
              <p className="text-sm text-zinc-600">
                {t('recipes.deleteConfirm', { title: deleteTarget?.title })}
              </p>
            </ModalBody>
            <ModalFooter className="flex justify-end gap-2">
              <Button
                variant="tertiary"
                onPress={onCancel}
                isDisabled={deleting}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                onPress={onConfirm}
                isDisabled={deleting}
              >
                {deleting ? t('common.deleting') : t('common.delete')}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default DeleteRecipeModal
