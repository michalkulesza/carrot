import { useTranslation } from 'react-i18next'
import {
  Button,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
} from '@heroui/react'
import Modal from '../../components/AnimatedModal'

interface ImportManualActionModalProps {
  isOpen: boolean
  onClose: () => void
  onRemove: () => void
  onContinue: () => void
}

const ImportManualActionModal = ({
  isOpen,
  onClose,
  onRemove,
  onContinue,
}: ImportManualActionModalProps) => {
  const { t } = useTranslation()

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContainer size="sm">
        <ModalDialog>
          <ModalHeader>{t('importJobs.userActionRequired.title')}</ModalHeader>
          <ModalBody>{t('importJobs.userActionRequired.body')}</ModalBody>
          <ModalFooter>
            <Button variant="tertiary" onPress={onRemove}>
              {t('importJobs.remove')}
            </Button>
            <Button variant="primary" onPress={onContinue}>
              {t('importJobs.userActionRequired.continue')}
            </Button>
          </ModalFooter>
        </ModalDialog>
      </ModalContainer>
    </Modal>
  )
}

export default ImportManualActionModal
