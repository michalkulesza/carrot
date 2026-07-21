import { useCallback, useMemo } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { MenuView, type MenuAction } from '@react-native-menu/menu'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useRouter, usePathname } from 'expo-router'
import type { InvitationOut, HouseholdLeaveNotificationOut } from '@carrot/shared/types'
import { colors } from '../theme/colors'
import {
  useTimers,
  getRemainingSeconds,
  formatCountdown,
  type TimerEntry,
} from '../context/TimerContext'
import { useNotificationHistory, type NotificationItem } from '../context/NotificationHistoryContext'
import { useHousehold } from '../context/HouseholdContext'
import { useAuth } from '../context/AuthContext'
import { useApiClient } from '@carrot/shared/api/context'

const buildTimerAction = (timer: TimerEntry, pathname: string, t: TFunction): MenuAction => {
  const remaining = getRemainingSeconds(timer)
  const isRunning = timer.status === 'running'
  const subtitle = isRunning
    ? formatCountdown(remaining)
    : `${t('timers.timerPaused')} · ${formatCountdown(remaining)}`
  const showGotoRecipe = pathname !== `/recipe/${timer.recipeId}`

  const subactions: MenuAction[] = [
    isRunning
      ? { id: `timer-pause-${timer.id}`, title: t('common.pause'), image: 'pause.circle' }
      : { id: `timer-resume-${timer.id}`, title: t('common.resume'), image: 'play.circle' },
    ...(showGotoRecipe
      ? [{ id: `timer-goto-${timer.id}`, title: t('timers.goToRecipe'), image: 'arrow.right.circle' }]
      : []),
    {
      id: `timer-cancel-${timer.id}`,
      title: t('common.cancel'),
      image: 'xmark.circle',
      attributes: { destructive: true },
    },
  ]

  return {
    id: `timer-${timer.id}`,
    title: `⏱ ${timer.recipeTitle}`,
    subtitle,
    subactions,
  }
}

const buildInvitationAction = (inv: InvitationOut, t: TFunction): MenuAction => ({
  id: `inv-${inv.id}`,
  title: `🏠 ${t('bell.invitationTitle', { name: inv.household_name })}`,
  subtitle: t('bell.from', { name: inv.invited_by_nickname || inv.invited_by_email }),
  subactions: [
    { id: `inv-accept-${inv.id}`, title: t('common.accept'), image: 'checkmark.circle' },
    {
      id: `inv-decline-${inv.id}`,
      title: t('common.decline'),
      image: 'xmark.circle',
      attributes: { destructive: true },
    },
  ],
})

const buildLeaveAction = (n: HouseholdLeaveNotificationOut, t: TFunction): MenuAction => ({
  id: `leave-dismiss-${n.id}`,
  title: `👋 ${t('bell.memberLeft', { name: n.left_user_nickname || n.left_user_email, household: n.household_name })}`,
})

const buildNotifAction = (notif: NotificationItem): MenuAction | null => {
  switch (notif.type) {
    case 'timer_done':
      return { id: `timer-done-${notif.id}`, title: `✓ ${notif.title}`, subtitle: notif.body }
    case 'invitation':
      return { id: `invitation-dismiss-${notif.id}`, title: `🏠 ${notif.title}`, subtitle: notif.body }
    case 'recipe_imported':
      return { id: `recipe-imported-${notif.id}`, title: `✅ ${notif.title}`, subtitle: notif.body }
    case 'recipe_failed':
      return {
        id: `recipe-failed-${notif.id}`,
        title: `❌ ${notif.title}`,
        subtitle: notif.body,
        attributes: { destructive: true },
      }
    default:
      return null
  }
}

const BellMenu = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { timers, pauseTimer, resumeTimer, cancelTimer } = useTimers()
  const { items: notifHistory, dismiss: dismissNotif, clearAll: clearNotifHistory } = useNotificationHistory()
  const { invitations, leaveNotifications, dismissLeaveNotification, refetchHouseholds, refetchInvitations } = useHousehold()
  const { refreshUser } = useAuth()
  const api = useApiClient()

  const timerList = useMemo(() => [...timers.values()], [timers])

  const totalCount = timerList.length + invitations.length + leaveNotifications.length + notifHistory.length

  const actions = useMemo(() => {
    if (totalCount === 0) {
      return [{ id: 'empty', title: t('bell.noNotifications'), attributes: { disabled: true } }]
    }

    const items: MenuAction[] = []

    for (const timer of timerList) items.push(buildTimerAction(timer, pathname, t))
    for (const inv of invitations) items.push(buildInvitationAction(inv, t))
    for (const n of leaveNotifications) items.push(buildLeaveAction(n, t))
    for (const notif of notifHistory) {
      const action = buildNotifAction(notif)
      if (action) items.push(action)
    }

    if (notifHistory.length > 0) {
      items.push({
        // No `image` here (unlike subactions) — a native icon on this row alone makes iOS
        // reserve a left icon column for every sibling row in the menu.
        id: 'clear-history',
        title: t('common.clearAll'),
        attributes: { destructive: true },
      })
    }

    return items
  }, [timerList, invitations, leaveNotifications, notifHistory, totalCount, pathname, t])

  const handleAction = useCallback(
    async ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      const id = nativeEvent.event
      if (id === 'clear-history') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } else {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
      // Split "namespace-action-payload" → key = "namespace-action", payload = rest
      const sep = id.indexOf('-', id.indexOf('-') + 1)
      const key = sep === -1 ? id : id.slice(0, sep)
      const payload = sep === -1 ? '' : id.slice(sep + 1)

      switch (key) {
        case 'timer-pause':
          pauseTimer(payload)
          break
        case 'timer-resume':
          resumeTimer(payload)
          break
        case 'timer-goto': {
          const timer = [...timers.values()].find((ti) => ti.id === payload)
          if (timer) router.push(`/recipe/${timer.recipeId}`)
          break
        }
        case 'timer-cancel':
          cancelTimer(payload)
          break
        case 'timer-done':
        case 'invitation-dismiss':
          dismissNotif(payload)
          break
        case 'inv-accept':
          try {
            await api.acceptInvitation(payload)
            // Accepting switches the user's active household server-side, so the local
            // user object must be refreshed or the UI keeps showing stale state.
            await refreshUser()
            refetchInvitations()
            refetchHouseholds()
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : t('bell.acceptInvitationFailed')
            Alert.alert(t('common.ok'), errorMessage)
          }
          break
        case 'inv-decline':
          try {
            await api.declineInvitation(payload)
            refetchInvitations()
          } catch {
            // ignore
          }
          break
        case 'leave-dismiss':
          dismissLeaveNotification(payload)
          break
        case 'recipe-imported': {
          const notif = notifHistory.find((n) => n.id === payload)
          if (notif?.recipe_id) router.push(`/recipe/${notif.recipe_id}`)
          dismissNotif(payload)
          break
        }
        case 'recipe-failed': {
          router.push('/(tabs)/recipes')
          dismissNotif(payload)
          break
        }
        case 'clear-history':
          clearNotifHistory()
          break
      }
    },
    [timers, pauseTimer, resumeTimer, cancelTimer, api, refreshUser, refetchInvitations, refetchHouseholds, dismissLeaveNotification, clearNotifHistory, dismissNotif, notifHistory, router, t],
  )

  return (
    <MenuView
      title={t('bell.notifications')}
      actions={actions}
      onOpenMenu={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      onPressAction={handleAction}
    >
      <View style={styles.bellBtn}>
        <Feather name="bell" size={22} color={colors.secondaryLabel} />
        {totalCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{totalCount > 9 ? '9+' : totalCount}</Text>
          </View>
        )}
      </View>
    </MenuView>
  )
}

const styles = StyleSheet.create({
  bellBtn: { padding: 4, position: 'relative' },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: colors.background, fontSize: 11, fontWeight: '700' },
})

export default BellMenu
