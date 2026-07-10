import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  toast,
} from '@heroui/react'
import { createHousehold } from '../../api/client'
import { buildColorSwatchStyle, PRESET_COLORS } from './helpers'

interface CreateHouseholdModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

const CreateHouseholdModal = ({
  isOpen,
  onClose,
  onCreated,
}: CreateHouseholdModalProps) => {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await createHousehold(name.trim() || undefined, color)
      toast.success(t('settings.householdCreated'), { timeout: 3000 })
      setName('')
      setColor(PRESET_COLORS[0])
      onCreated()
      onClose()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('settings.createHouseholdFailed')
      )
    } finally {
      setBusy(false)
    }
  }, [name, color, onCreated, onClose, t])

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
            <ModalHeader>{t('settings.newHouseholdTitle')}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium" htmlFor="household-name">
                  {t('settings.householdNameOptional')}
                </label>
                <input
                  id="household-name"
                  type="text"
                  placeholder={t('settings.householdNamePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <p className="text-sm font-medium mb-2">
                  {t('settings.colorLabel')}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                      style={buildColorSwatchStyle(c, color)}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
            </ModalBody>
            <ModalFooter>
              <Button variant="tertiary" onPress={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onPress={handleCreate}
                isDisabled={busy}
              >
                {t('common.create')}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default CreateHouseholdModal
