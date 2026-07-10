import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
} from '@heroui/react'

interface LogoutConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}

const LogoutConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
}: LogoutConfirmModalProps) => {
  const { t } = useTranslation()

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose()
    },
    [onClose]
  )

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
          <ModalDialog>
            <ModalHeader>{t('settings.logOutConfirmTitle')}</ModalHeader>
            <ModalFooter>
              <Button variant="tertiary" onPress={onClose}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger" onPress={onConfirm}>
                {t('settings.logOut')}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default LogoutConfirmModal
