import { useCallback, useMemo } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import { useRouter, usePathname } from 'expo-router'
import { colors } from '../theme/colors'
import {
  useTimers,
  getRemainingSeconds,
  formatCountdown,
} from '../context/TimerContext'
import { useNotificationHistory } from '../context/NotificationHistoryContext'
import { useHousehold } from '../context/HouseholdContext'
import { useAuth } from '../context/AuthContext'
import { useApiClient } from '@platekeeper/shared/api/context'

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
  // recipe_importing entries exist only so app/_layout.tsx's poller knows which jobs to
  // check — intentionally not surfaced here; only the eventual imported/failed result
  // should notify the user.
  const visibleNotifCount = useMemo(
    () => notifHistory.filter((n) => n.type !== 'recipe_importing').length,
    [notifHistory],
  )
  const totalCount = timerList.length + invitations.length + leaveNotifications.length + visibleNotifCount

  const actions = useMemo(() => {
    if (totalCount === 0) {
      return [{ id: 'empty', title: t('bell.noNotifications'), attributes: { disabled: true } }]
    }

    const items = []

    for (const timer of timerList) {
      const remaining = getRemainingSeconds(timer)
      const isRunning = timer.status === 'running'
      items.push({
        id: `timer-${timer.id}`,
        title: `⏱ ${timer.recipeTitle}`,
        subtitle: isRunning
          ? formatCountdown(remaining)
          : `${t('timers.timerPaused')} · ${formatCountdown(remaining)}`,
        subactions: [
          isRunning
            ? { id: `timer-pause-${timer.id}`, title: t('common.pause'), image: 'pause.circle' }
            : { id: `timer-resume-${timer.id}`, title: t('common.resume'), image: 'play.circle' },
          ...(pathname === `/recipe/${timer.recipeId}` ? [] : [{ id: `timer-goto-${timer.id}`, title: t('timers.goToRecipe'), image: 'arrow.right.circle' }]),
          {
            id: `timer-cancel-${timer.id}`,
            title: t('common.cancel'),
            image: 'xmark.circle',
            attributes: { destructive: true },
          },
        ],
      })
    }

    for (const inv of invitations) {
      items.push({
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
    }

    for (const n of leaveNotifications) {
      items.push({
        id: `leave-dismiss-${n.id}`,
        title: `👋 ${t('bell.memberLeft', { name: n.left_user_nickname || n.left_user_email, household: n.household_name })}`,
      })
    }

    for (const notif of notifHistory) {
      switch (notif.type) {
        case 'recipe_imported':
          items.push({
            id: `recipe-imported-${notif.id}`,
            title: `✅ ${notif.title}`,
            subtitle: notif.body,
          })
          break
        case 'recipe_failed':
          items.push({
            id: `recipe-failed-${notif.id}`,
            title: `❌ ${notif.title}`,
            subtitle: notif.body,
            attributes: { destructive: true },
          })
          break
      }
    }

    if (visibleNotifCount > 0) {
      items.push({
        id: 'clear-history',
        // No `image` here (unlike subactions) — a native icon on this row alone makes iOS
        // reserve a left icon column for every sibling row in the menu, pushing all the
        // other titles rightward.
        title: t('common.clearAll'),
        attributes: { destructive: true },
      })
    }

    return items
  }, [timerList, invitations, leaveNotifications, notifHistory, totalCount, pathname, t])

  const handleAction = useCallback(
    async ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      const id = nativeEvent.event
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
        case 'inv-accept':
          try {
            await api.acceptInvitation(payload)
            // Accepting switches the user's active household server-side, so the
            // local user object must be refreshed or the UI keeps showing stale state.
            await refreshUser()
            refetchInvitations()
            refetchHouseholds()
          } catch (e) {
            Alert.alert(t('common.ok'), e instanceof Error ? e.message : 'Error')
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
          const notif = notifHistory.find((n) => n.id === payload)
          if (notif?.job_kind && notif?.job_input) {
            const { job_kind: kind, job_input: inp } = notif
            switch (kind) {
              case 'url':
                router.push(`/import-recipe?type=url&value=${encodeURIComponent(inp.url!)}`)
                break
              case 'text':
                router.push(`/import-recipe?type=text&value=${encodeURIComponent(inp.text!)}`)
                break
              default:
                router.push('/import-recipe')
            }
          }
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
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.background, fontSize: 11, fontWeight: '700' },
})

export default BellMenu
