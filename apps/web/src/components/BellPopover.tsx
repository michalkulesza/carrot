import { useState } from 'react'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverDialog,
  toast,
} from '@heroui/react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { acceptInvitation, declineInvitation } from '../api/client'
import { useHousehold } from '../context/HouseholdContext'
import {
  useTimers,
  getRemainingSeconds,
  formatCountdown,
} from '../context/TimerContext'
import { useNotificationHistory } from '../context/NotificationHistoryContext'

export default function BellPopover() {
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

  async function handleAccept(id: string) {
    const inv = invitations.find((i) => i.id === id)
    setBusy(id)
    try {
      await acceptInvitation(id)
      refetchInvitations()
      refetchHouseholds()
      toast.success('Joined household', { timeout: 3000 })
      if (inv) {
        pushNotification({
          type: 'invitation',
          title: `Joined ${inv.household_name}`,
          body: inv.invited_by_nickname
            ? `Invited by ${inv.invited_by_nickname}`
            : `Invited by ${inv.invited_by_email}`,
        })
      }
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : 'Error', { timeout: 3000 })
    } finally {
      setBusy(null)
    }
  }

  async function handleDecline(id: string) {
    const inv = invitations.find((i) => i.id === id)
    setBusy(id)
    try {
      await declineInvitation(id)
      refetchInvitations()
      if (inv) {
        pushNotification({
          type: 'invitation',
          title: `Declined ${inv.household_name}`,
          body: inv.invited_by_nickname
            ? `Invited by ${inv.invited_by_nickname}`
            : `Invited by ${inv.invited_by_email}`,
        })
      }
    } catch {
      // ignore
    } finally {
      setBusy(null)
    }
  }

  return (
    <Popover>
      <Button
        variant="ghost"
        isIconOnly
        aria-label={t('bell.notifications')}
        className="relative rounded-full"
      >
        <svg
          className="w-5 h-5 text-zinc-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {count > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-danger text-danger-foreground text-[10px] font-bold flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Button>
      <PopoverContent className="p-0 w-80" placement="bottom end">
        <PopoverDialog>
          {count === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">
              {t('bell.noNotifications')}
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 max-h-96 overflow-y-auto">
              {timerList.map((timer) => {
                const remaining = getRemainingSeconds(timer)
                const isRunning = timer.status === 'running'

                return (
                  <li key={timer.id} className="px-4 py-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p
                          className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${isRunning ? 'text-amber-500' : 'text-zinc-400'}`}
                        >
                          {isRunning
                            ? t('timers.timerRunning')
                            : t('timers.timerPaused')}
                        </p>
                        <p className="text-sm font-medium truncate">
                          {timer.recipeTitle}
                        </p>
                        <p className="text-xs text-zinc-400 truncate">
                          {t('common.step')} {timer.stepIndex + 1}:{' '}
                          {timer.stepText.length > 45
                            ? timer.stepText.slice(0, 42) + '…'
                            : timer.stepText}
                        </p>
                      </div>
                      <span
                        className={`font-mono text-sm font-bold tabular-nums shrink-0 pt-4 ${isRunning ? 'text-amber-600' : 'text-zinc-400'}`}
                      >
                        {timer.status === 'done'
                          ? t('common.doneCheck')
                          : formatCountdown(remaining)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {isRunning ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => pauseTimer(timer.id)}
                        >
                          {t('common.pause')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onPress={() => resumeTimer(timer.id)}
                        >
                          {t('common.resume')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="danger-soft"
                        onPress={() => cancelTimer(timer.id)}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </li>
                )
              })}
              {invitations.map((inv) => (
                <li key={inv.id} className="px-4 py-3 flex flex-col gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-0.5">
                      {t('bell.householdInvitation')}
                    </p>
                    <p className="text-sm font-medium">{inv.household_name}</p>
                    <p className="text-xs text-zinc-400">
                      {t('bell.from', {
                        name: inv.invited_by_nickname || inv.invited_by_email,
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      isDisabled={busy === inv.id}
                      onPress={() => handleAccept(inv.id)}
                    >
                      {t('common.accept')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={busy === inv.id}
                      onPress={() => handleDecline(inv.id)}
                    >
                      {t('common.decline')}
                    </Button>
                  </div>
                </li>
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
                    <li key={item.id} className="px-4 py-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${
                              item.type === 'timer_done'
                                ? 'text-emerald-500'
                                : 'text-zinc-400'
                            }`}
                          >
                            {item.type === 'timer_done'
                              ? t('bell.timerDone')
                              : t('bell.household')}
                          </p>
                          <p className="text-sm font-medium truncate">
                            {item.title}
                          </p>
                          {item.body && (
                            <p className="text-xs text-zinc-400 truncate">
                              {item.body}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => dismissNotif(item.id)}
                          className="shrink-0 text-zinc-300 hover:text-zinc-500 transition-colors mt-0.5 text-lg leading-none"
                          aria-label="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                      {item.url && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          onPress={() => navigate(item.url!)}
                        >
                          {t('common.goToStep')}
                        </Button>
                      )}
                    </li>
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
