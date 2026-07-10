import { useCallback, useState } from 'react'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverDialog,
  toast,
} from '@heroui/react'
import { Bell } from 'react-feather'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { InvitationOut } from '@carrot/shared/types'
import { acceptInvitation, declineInvitation } from '../api/client'
import { useHousehold } from '../context/HouseholdContext'
import {
  useTimers,
  getRemainingSeconds,
  formatCountdown,
  type TimerEntry,
} from '../context/TimerContext'
import {
  useNotificationHistory,
  type NotificationItem,
} from '../context/NotificationHistoryContext'

const STEP_TEXT_MAX_LENGTH = 45

const truncateStepText = (text: string): string =>
  text.length > STEP_TEXT_MAX_LENGTH
    ? `${text.slice(0, STEP_TEXT_MAX_LENGTH - 3)}…`
    : text

const NotificationEmptyState = ({ t }: { t: TFunction }) => (
  <div className="px-4 py-6 text-center text-sm text-zinc-400">
    {t('bell.noNotifications')}
  </div>
)

interface TimerListItemProps {
  timer: TimerEntry
  t: TFunction
  onPause: (id: string) => void
  onResume: (id: string) => void
  onCancel: (id: string) => void
}

const TimerListItem = ({
  timer,
  t,
  onPause,
  onResume,
  onCancel,
}: TimerListItemProps) => {
  const remaining = getRemainingSeconds(timer)
  const isRunning = timer.status === 'running'
  const statusLabelClass = isRunning ? 'text-amber-500' : 'text-zinc-400'
  const statusLabel = isRunning
    ? t('timers.timerRunning')
    : t('timers.timerPaused')
  const remainingClass = isRunning ? 'text-amber-600' : 'text-zinc-400'
  const remainingLabel =
    timer.status === 'done' ? t('common.doneCheck') : formatCountdown(remaining)

  return (
    <li className="px-4 py-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${statusLabelClass}`}
          >
            {statusLabel}
          </p>
          <p className="text-sm font-medium truncate">{timer.recipeTitle}</p>
          <p className="text-xs text-zinc-400 truncate">
            {t('common.step')} {timer.stepIndex + 1}:{' '}
            {truncateStepText(timer.stepText)}
          </p>
        </div>
        <span
          className={`font-mono text-sm font-bold tabular-nums shrink-0 pt-4 ${remainingClass}`}
        >
          {remainingLabel}
        </span>
      </div>
      <div className="flex gap-2">
        {isRunning ? (
          <Button
            size="sm"
            variant="secondary"
            onPress={() => onPause(timer.id)}
          >
            {t('common.pause')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onPress={() => onResume(timer.id)}
          >
            {t('common.resume')}
          </Button>
        )}
        <Button
          size="sm"
          variant="danger-soft"
          onPress={() => onCancel(timer.id)}
        >
          {t('common.cancel')}
        </Button>
      </div>
    </li>
  )
}

interface InvitationListItemProps {
  invitation: InvitationOut
  t: TFunction
  isBusy: boolean
  onAccept: (id: string) => void
  onDecline: (id: string) => void
}

const InvitationListItem = ({
  invitation,
  t,
  isBusy,
  onAccept,
  onDecline,
}: InvitationListItemProps) => (
  <li className="px-4 py-3 flex flex-col gap-2">
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-0.5">
        {t('bell.householdInvitation')}
      </p>
      <p className="text-sm font-medium">{invitation.household_name}</p>
      <p className="text-xs text-zinc-400">
        {t('bell.from', {
          name: invitation.invited_by_nickname || invitation.invited_by_email,
        })}
      </p>
    </div>
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="primary"
        isDisabled={isBusy}
        onPress={() => onAccept(invitation.id)}
      >
        {t('common.accept')}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        isDisabled={isBusy}
        onPress={() => onDecline(invitation.id)}
      >
        {t('common.decline')}
      </Button>
    </div>
  </li>
)

interface NotificationHistoryItemProps {
  item: NotificationItem
  t: TFunction
  onDismiss: (id: string) => void
  onGoToStep: (url: string) => void
}

const NotificationHistoryItem = ({
  item,
  t,
  onDismiss,
  onGoToStep,
}: NotificationHistoryItemProps) => {
  const isTimerDone = item.type === 'timer_done'
  const labelClass = isTimerDone ? 'text-emerald-500' : 'text-zinc-400'
  const label = isTimerDone ? t('bell.timerDone') : t('bell.household')
  const url = item.url

  return (
    <li className="px-4 py-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${labelClass}`}
          >
            {label}
          </p>
          <p className="text-sm font-medium truncate">{item.title}</p>
          {item.body && (
            <p className="text-xs text-zinc-400 truncate">{item.body}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="shrink-0 text-zinc-300 hover:text-zinc-500 transition-colors mt-0.5 text-lg leading-none"
          aria-label={t('common.dismiss')}
        >
          ×
        </button>
      </div>
      {url && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          onPress={() => onGoToStep(url)}
        >
          {t('common.goToStep')}
        </Button>
      )}
    </li>
  )
}

const BellPopover = () => {
  const { invitations, refetchInvitations, refetchHouseholds } = useHousehold()
  const { timers, pauseTimer, resumeTimer, cancelTimer } = useTimers()
  const {
    items: notifHistory,
    dismiss: dismissNotif,
    clearAll: clearNotifHistory,
    push: pushNotification,
  } = useNotificationHistory()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [busy, setBusy] = useState<string | null>(null)

  const timerList = [...timers.values()]
  const count = invitations.length + timerList.length + notifHistory.length
  const badgeLabel = count > 9 ? '9+' : String(count)

  const handleAccept = useCallback(
    async (id: string) => {
      const inv = invitations.find((i) => i.id === id)
      setBusy(id)

      try {
        await acceptInvitation(id)
        refetchInvitations()
        refetchHouseholds()
        toast.success(t('bell.joinedHousehold'), { timeout: 3000 })

        if (inv) {
          pushNotification({
            type: 'invitation',
            title: t('bell.joinedHouseholdTitle', { name: inv.household_name }),
            body: t('bell.invitedBy', {
              name: inv.invited_by_nickname || inv.invited_by_email,
            }),
          })
        }
      } catch (e) {
        const errorMessage =
          e instanceof Error ? e.message : t('bell.acceptInvitationFailed')
        toast.danger(errorMessage, { timeout: 3000 })
      } finally {
        setBusy(null)
      }
    },
    [invitations, refetchInvitations, refetchHouseholds, pushNotification, t]
  )

  const handleDecline = useCallback(
    async (id: string) => {
      const inv = invitations.find((i) => i.id === id)
      setBusy(id)

      try {
        await declineInvitation(id)
        refetchInvitations()

        if (inv) {
          pushNotification({
            type: 'invitation',
            title: t('bell.declinedHouseholdTitle', {
              name: inv.household_name,
            }),
            body: t('bell.invitedBy', {
              name: inv.invited_by_nickname || inv.invited_by_email,
            }),
          })
        }
      } catch {
        // ignore
      } finally {
        setBusy(null)
      }
    },
    [invitations, refetchInvitations, pushNotification, t]
  )

  const handleGoToStep = useCallback((url: string) => navigate(url), [navigate])

  return (
    <Popover>
      <Button
        variant="ghost"
        isIconOnly
        aria-label={t('bell.notifications')}
        className="relative rounded-full"
      >
        <Bell className="w-5 h-5 text-zinc-600" />
        {count > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-danger text-danger-foreground text-[10px] font-bold flex items-center justify-center">
            {badgeLabel}
          </span>
        )}
      </Button>
      <PopoverContent className="p-0 w-80" placement="bottom end">
        <PopoverDialog>
          {count === 0 ? (
            <NotificationEmptyState t={t} />
          ) : (
            <ul className="divide-y divide-zinc-100 max-h-96 overflow-y-auto">
              {timerList.map((timer) => (
                <TimerListItem
                  key={timer.id}
                  timer={timer}
                  t={t}
                  onPause={pauseTimer}
                  onResume={resumeTimer}
                  onCancel={cancelTimer}
                />
              ))}
              {invitations.map((inv) => (
                <InvitationListItem
                  key={inv.id}
                  invitation={inv}
                  t={t}
                  isBusy={busy === inv.id}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                />
              ))}
              {notifHistory.length > 0 && (
                <>
                  <li className="px-4 py-2 flex items-center justify-between bg-zinc-50">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      {t('bell.history')}
                    </span>
                    <button
                      type="button"
                      onClick={clearNotifHistory}
                      className="text-[10px] font-medium text-zinc-400 hover:text-zinc-600 transition-colors"
                    >
                      {t('common.clearAll')}
                    </button>
                  </li>
                  {notifHistory.map((item) => (
                    <NotificationHistoryItem
                      key={item.id}
                      item={item}
                      t={t}
                      onDismiss={dismissNotif}
                      onGoToStep={handleGoToStep}
                    />
                  ))}
                </>
              )}
            </ul>
          )}
        </PopoverDialog>
      </PopoverContent>
    </Popover>
  )
}

export default BellPopover
