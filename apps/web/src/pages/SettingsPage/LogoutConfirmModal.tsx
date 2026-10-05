import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
} from '@heroui/react'
import Modal from '../../components/AnimatedModal'

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
    </Modal>
  )
}

export default LogoutConfirmModal
