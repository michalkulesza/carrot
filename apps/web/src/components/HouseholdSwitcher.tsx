import { Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/react";
import { useHousehold } from "../context/HouseholdContext";

interface HouseholdSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HouseholdSwitcher({ isOpen, onClose }: HouseholdSwitcherProps) {
  const { households, activeHouseholdId, switchHousehold } = useHousehold();

  async function handleSwitch(id: string | null) {
    onClose();
    if (id !== activeHouseholdId) {
      await switchHousehold(id);
    }
  }

  const options = [
    { id: null, name: "Personal", color: null },
    ...households.map((h) => ({ id: h.id, name: h.name, color: h.color })),
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" classNames={{ base: "!rounded-xl overflow-hidden" }}>
      <ModalContent>
        <ModalHeader className="pb-2">Switch context</ModalHeader>
        <ModalBody className="px-2 pb-4">
          <ul className="flex flex-col gap-1">
            {options.map((opt) => {
              const active = opt.id === activeHouseholdId;
              return (
                <li key={opt.id ?? "personal"}>
                  <button
                    type="button"
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                      active
                        ? "bg-default-100 font-semibold"
                        : "hover:bg-default-50"
                    }`}
                    onClick={() => handleSwitch(opt.id)}
                  >
                    <span
                      className="w-4 h-4 rounded-full shrink-0 border border-default-200"
                      style={{ backgroundColor: opt.color ?? "transparent" }}
                    />
                    <span className="text-sm">{opt.name}</span>
                    {active && (
                      <svg className="w-4 h-4 ml-auto text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
