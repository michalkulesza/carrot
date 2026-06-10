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
} from '@heroui/react'
import { useNavigate } from 'react-router-dom'
import {
  useTimers,
  formatDurationLabel,
  type TimerEntry,
} from '../context/TimerContext'

const ExpiredTimersModal = () => {
  const { expiredQueue, dismissExpired } = useTimers()
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (expiredQueue.length === 0) return null

  const handleOpenChange = (open: boolean) => {
    if (!open) dismissExpired()
  }

  const goToStep = (timer: TimerEntry) => {
    dismissExpired()
    navigate(
      `/?recipe=${timer.recipeId}&step=${timer.componentIndex}-${timer.stepIndex}`
    )
  }

  return (
    <Modal isOpen onOpenChange={handleOpenChange}>
      <ModalBackdrop isDismissable>
        <ModalContainer
          size="sm"
          scroll="inside"
          className="!rounded-xl overflow-hidden"
        >
          <ModalDialog className="max-h-[calc(100dvh-2rem)] sm:max-h-[600px]">
            <ModalHeader>
              {t('timers.timerDone', { count: expiredQueue.length })}
            </ModalHeader>
            <ModalBody className="flex flex-col gap-3">
              {expiredQueue.map((timer) => (
                <div
                  key={timer.id}
                  className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-3"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold mt-0.5">
                      ✓
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-800 leading-snug">
                        {timer.recipeTitle}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {t('common.step')} {timer.stepIndex + 1} ·{' '}
                        {formatDurationLabel(timer.totalSeconds)}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-snug line-clamp-2">
                        {timer.stepText}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onPress={() => goToStep(timer)}
                  >
                    {t('common.goToStep')}
                  </Button>
                </div>
              ))}
            </ModalBody>
            <ModalFooter>
              <Button variant="primary" onPress={dismissExpired}>
                {t('common.ok')}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default ExpiredTimersModal
