import { useState } from 'react'
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
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
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={styles.bellBtn}
        accessibilityLabel={t('bell.notifications')}
        accessibilityRole="button"
      >
        <Feather name="bell" size={22} color="#374151" />
        {totalCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {totalCount > 9 ? '9+' : totalCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('bell.notifications')}</Text>
            <TouchableOpacity
              onPress={() => setOpen(false)}
              accessibilityLabel={t('common.close')}
              accessibilityRole="button"
            >
              <Feather name="x" size={22} color="#374151" />
            </TouchableOpacity>
          </View>

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
                          { color: isRunning ? '#d97706' : '#9ca3af' },
                        ]}
                      >
                        {isRunning ? t('timers.timerRunning').toUpperCase() : t('timers.timerPaused').toUpperCase()}
                      </Text>
                      <Text
                        style={[
                          styles.countdown,
                          { color: isRunning ? '#d97706' : '#9ca3af' },
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
                        <TouchableOpacity
                          style={styles.btnSecondary}
                          onPress={() => pauseTimer(timer.id)}
                          accessibilityLabel={t('common.pause')}
                          accessibilityRole="button"
                        >
                          <Text style={styles.btnSecondaryText}>{t('common.pause')}</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.btnSecondary}
                          onPress={() => resumeTimer(timer.id)}
                          accessibilityLabel={t('common.resume')}
                          accessibilityRole="button"
                        >
                          <Text style={styles.btnSecondaryText}>{t('common.resume')}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.btnDanger}
                        onPress={() => cancelTimer(timer.id)}
                        accessibilityLabel={t('common.cancel')}
                        accessibilityRole="button"
                      >
                        <Text style={styles.btnDangerText}>{t('common.cancel')}</Text>
                      </TouchableOpacity>
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
                    <TouchableOpacity
                      style={styles.btnPrimary}
                      onPress={() => handleAccept(inv.id)}
                      disabled={busy === inv.id}
                      accessibilityLabel={t('common.accept')}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnPrimaryText}>{t('common.accept')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.btnSecondary}
                      onPress={() => handleDecline(inv.id)}
                      disabled={busy === inv.id}
                      accessibilityLabel={t('common.decline')}
                      accessibilityRole="button"
                    >
                      <Text style={styles.btnSecondaryText}>{t('common.decline')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Notification history */}
              {notifHistory.length > 0 && (
                <>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyLabel}>{t('bell.history').toUpperCase()}</Text>
                    <TouchableOpacity
                      onPress={clearNotifHistory}
                      accessibilityLabel={t('common.clearAll')}
                      accessibilityRole="button"
                    >
                      <Text style={styles.clearAllText}>{t('common.clearAll')}</Text>
                    </TouchableOpacity>
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
                                  ? '#10b981'
                                  : '#6b7280',
                            },
                          ]}
                        >
                          {(item.type === 'timer_done'
                            ? t('bell.timerDone')
                            : t('bell.household')
                          ).toUpperCase()}
                        </Text>
                        <TouchableOpacity
                          onPress={() => dismissNotif(item.id)}
                          accessibilityLabel={t('common.dismiss')}
                          accessibilityRole="button"
                        >
                          <Feather name="x" size={16} color="#9ca3af" />
                        </TouchableOpacity>
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
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: '#f9fafb' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#111' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15, color: '#9ca3af' },
  list: { flex: 1 },
  listContent: { paddingBottom: 32 },
  item: {
    backgroundColor: '#fff',
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
    color: '#9ca3af',
    letterSpacing: 0.4,
  },
  countdown: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
  },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 2 },
  itemBody: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  btnRow: { flexDirection: 'row', gap: 8 },
  btnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  btnSecondaryText: { color: '#374151', fontSize: 13, fontWeight: '500' },
  btnDanger: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },
  btnDangerText: { color: '#dc2626', fontSize: 13, fontWeight: '600' },
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
    color: '#9ca3af',
    letterSpacing: 0.4,
  },
  clearAllText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
})

export default BellModal
