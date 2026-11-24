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

interface ImportDuplicateModalProps {
  isOpen: boolean
  canGoToRecipe: boolean
  onClose: () => void
  onDontImport: () => void
  onGoToRecipe: () => void
  onImportAnyway: () => void
}

const ImportDuplicateModal = ({
  isOpen,
  canGoToRecipe,
  onClose,
  onDontImport,
  onGoToRecipe,
  onImportAnyway,
}: ImportDuplicateModalProps) => {
  const { t } = useTranslation()

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContainer size="sm">
        <ModalDialog>
          <ModalHeader>{t('importJobs.failure.duplicate_recipe')}</ModalHeader>
          <ModalBody>{t('importJobs.duplicate.message')}</ModalBody>
          <ModalFooter>
            <Button variant="tertiary" onPress={onDontImport}>
              {t('importJobs.duplicate.dontImport')}
            </Button>
            {canGoToRecipe && (
              <Button variant="secondary" onPress={onGoToRecipe}>
                {t('importJobs.duplicate.goToRecipe')}
              </Button>
            )}
            <Button variant="primary" onPress={onImportAnyway}>
              {t('importJobs.duplicate.importAnyway')}
            </Button>
          </ModalFooter>
        </ModalDialog>
      </ModalContainer>
    </Modal>
  )
}

export default ImportDuplicateModal
