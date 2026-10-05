import { Modal, ModalBackdrop } from '@heroui/react'
import { usePresence } from 'framer-motion'
import { useModalExitTransition } from '../../../hooks/useModalExitTransition'
import type { AnimatedModalProps } from '..'

const AnimatedModalContent = ({
  children,
  onOpenChange,
  ...props
}: AnimatedModalProps) => {
  const [isPresent, safeToRemove] = usePresence()
  const backdropRef = useModalExitTransition(isPresent, safeToRemove)

  return (
    <Modal
      {...props}
      isOpen
      onOpenChange={(open) => {
        if (isPresent) onOpenChange?.(open)
      }}
    >
      <ModalBackdrop
        ref={backdropRef}
        isDismissable={isPresent}
        inert={!isPresent || undefined}
        className={!isPresent ? 'pointer-events-none' : undefined}
      >
        {children}
      </ModalBackdrop>
    </Modal>
  )
}

export default AnimatedModalContent
