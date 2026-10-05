import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { ModalRootProps } from '@heroui/react'
import { AnimatePresence, usePresence } from 'framer-motion'
import AnimatedModalContent from './AnimatedModalContent'

export interface AnimatedModalProps extends Omit<ModalRootProps, 'children'> {
  children: ReactNode
}

const AnimatedModal = ({ isOpen, children, ...props }: AnimatedModalProps) => {
  const [isPresent, safeToRemove] = usePresence()
  const hasContent = useRef(Boolean(isOpen))
  const handleExitComplete = useCallback(() => {
    hasContent.current = false
    safeToRemove?.()
  }, [safeToRemove])

  useEffect(() => {
    if (isPresent && isOpen) hasContent.current = true
    // A closed sibling modal has no animation to wait for during route exit.
    if (!isPresent && !hasContent.current) safeToRemove?.()
  }, [isPresent, isOpen, safeToRemove])

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {isPresent && isOpen && (
        <AnimatedModalContent key="modal" {...props}>
          {children}
        </AnimatedModalContent>
      )}
    </AnimatePresence>
  )
}

export default AnimatedModal
