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
import { useTimers, formatCountdown } from '../context/TimerContext'

const ResumeTimersModal = () => {
  const { resumeInfo, confirmResume, confirmClear } = useTimers()
  const { t } = useTranslation()

  if (!resumeInfo) return null

  const { interrupted, expired } = resumeInfo

  const handleOpenChange = (open: boolean) => {
    if (!open) confirmResume()
  }

  return (
    <Modal isOpen onOpenChange={handleOpenChange}>
      <ModalBackdrop isDismissable>
        <ModalContainer size="sm" className="!rounded-xl overflow-hidden">
          <ModalDialog>
            <ModalHeader>{t('timers.running')}</ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              {interrupted.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                    {t('timers.resumedAutomatically')}
                  </p>
                  {interrupted.map((timer) => (
                    <div
                      key={timer.id}
                      className="flex items-center justify-between text-sm text-zinc-600"
                    >
                      <span>
                        <span className="font-medium">{timer.recipeTitle}</span>{' '}
                        — {t('common.step')} {timer.stepIndex + 1}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-zinc-400">
                        {formatCountdown(timer.remainingAtStart)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {expired.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                    {t('timers.finishedWhileAway')}
                  </p>
                  {expired.map((timer) => (
                    <p key={timer.id} className="text-sm text-zinc-600">
                      <span className="font-medium">{timer.recipeTitle}</span> —{' '}
                      {t('common.step')} {timer.stepIndex + 1}
                    </p>
                  ))}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="tertiary" onPress={confirmClear}>
                {t('common.clearAll')}
              </Button>
              <Button variant="primary" onPress={confirmResume}>
                {t('common.ok')}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  )
}

export default ResumeTimersModal
