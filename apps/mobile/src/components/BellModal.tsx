import { useState } from 'react'
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { GlassView } from 'expo-glass-effect'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { colors } from '../theme/colors'
import {
  useTimers,
  getRemainingSeconds,
  formatCountdown,
  formatDurationLabel,
} from '../context/TimerContext'
import { useNotificationHistory } from '../context/NotificationHistoryContext'
import { useHousehold } from '../context/HouseholdContext'
import { useApiClient } from '@platekeeper/shared/api/context'

const BellModal = () => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { timers, pauseTimer, resumeTimer, cancelTimer } = useTimers()
  const { items: notifHistory, dismiss: dismissNotif, clearAll: clearNotifHistory } =
    useNotificationHistory()
  const { invitations, refetchHouseholds, refetchInvitations } = useHousehold()
  const api = useApiClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const timerList = [...timers.values()]
  const totalCount = timerList.length + invitations.length + notifHistory.length

  const handleAccept = async (id: string) => {
    setBusy(id)
    try {
      await api.acceptInvitation(id)
      refetchInvitations()
      refetchHouseholds()
    } catch (e) {
      Alert.alert(t('common.ok'), e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(null)
    }
  }

  const handleDecline = async (id: string) => {
    setBusy(id)
    try {
      await api.declineInvitation(id)
      refetchInvitations()
    } catch {
      // ignore
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel={t('bell.notifications')}
        accessibilityRole="button"
      >
        <Feather name="bell" size={22} color={colors.secondaryLabel} />
        {totalCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {totalCount > 9 ? '9+' : totalCount}
            </Text>
          </View>
        )}
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <GlassView style={styles.modalHeader} glassEffectStyle="regular">
            <Text style={styles.modalTitle}>{t('bell.notifications')}</Text>
            <Pressable
              onPress={() => setOpen(false)}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              accessibilityLabel={t('common.close')}
              accessibilityRole="button"
            >
              <Feather name="x" size={22} color={colors.secondaryLabel} />
            </Pressable>
          </GlassView>

          {totalCount === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('bell.noNotifications')}</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {/* Active timers */}
              {timerList.map((timer) => {
                const remaining = getRemainingSeconds(timer)
                const isRunning = timer.status === 'running'
                return (
                  <View key={timer.id} style={styles.item}>
                    <View style={styles.itemHeader}>
                      <Text
                        style={[
                          styles.itemBadge,
                          { color: isRunning ? colors.orange : colors.tertiaryLabel },
                        ]}
                      >
                        {isRunning ? t('timers.timerRunning').toUpperCase() : t('timers.timerPaused').toUpperCase()}
                      </Text>
                      <Text
                        style={[
                          styles.countdown,
                          { color: isRunning ? colors.orange : colors.tertiaryLabel },
                        ]}
                      >
                        {timer.status === 'done'
                          ? t('common.doneCheck')
                          : formatCountdown(remaining)}
                      </Text>
                    </View>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {timer.recipeTitle}
                    </Text>
                    <Text style={styles.itemBody} numberOfLines={2}>
                      {t('common.step')} {timer.stepIndex + 1}:{' '}
                      {timer.stepText.length > 60
                        ? timer.stepText.slice(0, 57) + '…'
                        : timer.stepText}
                    </Text>
                    <View style={styles.btnRow}>
                      {isRunning ? (
                        <Pressable
                          style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.7 }]}
                          onPress={() => pauseTimer(timer.id)}
                          accessibilityLabel={t('common.pause')}
                          accessibilityRole="button"
                        >
                          <Text style={styles.btnSecondaryText}>{t('common.pause')}</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.7 }]}
                          onPress={() => resumeTimer(timer.id)}
                          accessibilityLabel={t('common.resume')}
                          accessibilityRole="button"
                        >
                          <Text style={styles.btnSecondaryText}>{t('common.resume')}</Text>
                        </Pressable>
                      )}
                      <Pressable
                        style={({ pressed }) => [styles.btnDanger, pressed && { opacity: 0.7 }]}
                        onPress={() => cancelTimer(timer.id)}
                        accessibilityLabel={t('common.cancel')}
                        accessibilityRole="button"
                      >
                        <Text style={styles.btnDangerText}>{t('common.cancel')}</Text>
                      </Pressable>
                    </View>
                  </View>
                )
              })}

              {/* Pending invitations */}
              {invitations.map((inv) => (
                <View key={inv.id} style={styles.item}>
                  <Text style={styles.itemBadge}>
                    {t('bell.householdInvitation').toUpperCase()}
                  </Text>
                  <Text style={styles.itemTitle}>{inv.household_name}</Text>
                  <Text style={styles.itemBody}>
                    {t('bell.from', {
                      name: inv.invited_by_nickname || inv.invited_by_email,
                    })}
                  </Text>
                  <View style={styles.btnRow}>
                    <Pressable
                      style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.7 }]}
                      onPress={() => handleAccept(inv.id)}
                      disabled={busy === inv.id}
                      accessibilityLabel={t('common.accept')}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnPrimaryText}>{t('common.accept')}</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.7 }]}
                      onPress={() => handleDecline(inv.id)}
                      disabled={busy === inv.id}
                      accessibilityLabel={t('common.decline')}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnSecondaryText}>{t('common.decline')}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}

              {/* Notification history */}
              {notifHistory.length > 0 && (
                <>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyLabel}>{t('bell.history').toUpperCase()}</Text>
                    <Pressable
                      onPress={clearNotifHistory}
                      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                      accessibilityLabel={t('common.clearAll')}
                      accessibilityRole="button"
                    >
                      <Text style={styles.clearAllText}>{t('common.clearAll')}</Text>
                    </Pressable>
                  </View>
                  {notifHistory.map((item) => (
                    <View key={item.id} style={styles.item}>
                      <View style={styles.itemHeader}>
                        <Text
                          style={[
                            styles.itemBadge,
                            {
                              color:
                                item.type === 'timer_done'
                                  ? colors.green
                                  : colors.secondaryLabel,
                            },
                          ]}
                        >
                          {(item.type === 'timer_done'
                            ? t('bell.timerDone')
                            : t('bell.household')
                          ).toUpperCase()}
                        </Text>
                        <Pressable
                          onPress={() => dismissNotif(item.id)}
                          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                          accessibilityLabel={t('common.dismiss')}
                          accessibilityRole="button"
                        >
                          <Feather name="x" size={16} color={colors.tertiaryLabel} />
                        </Pressable>
                      </View>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {item.body ? (
                        <Text style={styles.itemBody} numberOfLines={1}>
                          {item.body}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  bellBtn: {
    padding: 4,
    marginRight: 8,
    position: 'relative',
  },
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
  badgeText: { color: colors.background, fontSize: 9, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: colors.secondaryBackground },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.label },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15, color: colors.tertiaryLabel },
  list: { flex: 1 },
  listContent: { paddingBottom: 32 },
  item: {
    backgroundColor: colors.background,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.tertiaryLabel,
    letterSpacing: 0.4,
  },
  countdown: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
  },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.label, marginBottom: 2 },
  itemBody: { fontSize: 13, color: colors.secondaryLabel, marginBottom: 10 },
  btnRow: { flexDirection: 'row', gap: 8 },
  btnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.blue,
  },
  btnPrimaryText: { color: colors.background, fontSize: 13, fontWeight: '600' },
  btnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.secondaryBackground,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
  },
  btnSecondaryText: { color: colors.secondaryLabel, fontSize: 13, fontWeight: '500' },
  btnDanger: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.brandLight,
  },
  btnDangerText: { color: colors.red, fontSize: 13, fontWeight: '600' },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 0,
  },
  historyLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.tertiaryLabel,
    letterSpacing: 0.4,
  },
  clearAllText: { fontSize: 12, color: colors.secondaryLabel, fontWeight: '500' },
})

export default BellModal
