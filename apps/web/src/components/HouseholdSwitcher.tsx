import { useCallback, useMemo } from 'react'
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalBody,
} from '@heroui/react'
import { Check } from 'react-feather'
import { useTranslation } from 'react-i18next'
import { useHousehold } from '../context/HouseholdContext'

interface HouseholdOption {
  id: string | null
  name: string
  color: string | null
}

interface HouseholdOptionRowProps {
  option: HouseholdOption
  active: boolean
  onSelect: (id: string | null) => void
}

const HouseholdOptionRow = ({
  option,
  active,
  onSelect,
}: HouseholdOptionRowProps) => {
  const handleClick = useCallback(() => {
    onSelect(option.id)
  }, [onSelect, option.id])

  const buttonClassName = `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
    active ? 'bg-zinc-100 font-semibold' : 'hover:bg-zinc-50'
  }`

  return (
    <li>
      <button type="button" className={buttonClassName} onClick={handleClick}>
        <span
          className="w-4 h-4 rounded-full shrink-0 border border-zinc-200"
          style={{ backgroundColor: option.color ?? 'transparent' }}
        />
        <span className="text-sm">{option.name}</span>
        {active && (
          <Check
            size={16}
            strokeWidth={2.5}
            className="ml-auto text-primary shrink-0"
          />
        )}
      </button>
    </li>
  )
}

interface HouseholdSwitcherProps {
  isOpen: boolean
  onClose: () => void
}

const HouseholdSwitcher = ({ isOpen, onClose }: HouseholdSwitcherProps) => {
  const { households, activeHouseholdId, switchHousehold } = useHousehold()
  const { t } = useTranslation()

  const handleSwitch = useCallback(
    async (id: string | null) => {
      onClose()

      if (id !== activeHouseholdId) {
        await switchHousehold(id)
      }
    },
    [onClose, activeHouseholdId, switchHousehold]
  )

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose()
    },
    [onClose]
  )

  const options = useMemo<HouseholdOption[]>(
    () => [
      { id: null, name: t('households.personal'), color: null },
      ...households.map((h) => ({ id: h.id, name: h.name, color: h.color })),
    ],
    [households, t]
  )

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
          <ModalDialog>
            <ModalHeader className="pb-2">
              {t('households.switchContext')}
            </ModalHeader>
            <ModalBody className="px-2 pb-4">
              <ul className="flex flex-col gap-1">
                {options.map((opt) => (
                  <HouseholdOptionRow
                    key={opt.id ?? 'personal'}
                    option={opt}
                    active={opt.id === activeHouseholdId}
                    onSelect={handleSwitch}
                  />
                ))}
              </ul>
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default HouseholdSwitcher
