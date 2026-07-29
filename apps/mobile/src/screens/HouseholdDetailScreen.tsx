import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import * as Clipboard from 'expo-clipboard'
import { useHouseholds } from '@carrot/shared/hooks/useHouseholds'
import { useMembers } from '@carrot/shared/hooks/useMembers'
import type { MemberOut } from '@carrot/shared/types'
import { HOUSEHOLD_COLOR_OPTIONS } from '@carrot/shared/utils/householdColors'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import { colors } from '../theme/colors'

const PRESET_COLORS = HOUSEHOLD_COLOR_OPTIONS

interface HeaderSaveButtonProps {
  saving: boolean
  isDirty: boolean
  onPress: () => void
}

const HeaderSaveButton = ({ saving, isDirty, onPress }: HeaderSaveButtonProps) => {
  const { t } = useTranslation()

  if (saving) {
    return <ActivityIndicator style={styles.headerSaveBtn} />
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!isDirty}
      hitSlop={8}
      style={styles.headerSaveBtn}
      accessibilityLabel={t('settings.saveChanges')}
      accessibilityRole="button"
    >
      <Text style={[styles.headerSaveText, !isDirty && styles.headerSaveTextDisabled]}>
        {t('common.save')}
      </Text>
    </Pressable>
  )
}

interface MemberRowProps {
  member: MemberOut
  isAdmin: boolean
  isSelf: boolean
  busy: boolean
  onRemove: (userId: string) => void
  onPromote: (userId: string) => void
}

const MemberRow = ({ member, isAdmin, isSelf, busy, onRemove, onPromote }: MemberRowProps) => {
  const { t } = useTranslation()
  const handleRemove = useCallback(() => onRemove(member.user_id), [member.user_id, onRemove])
  const handlePromote = useCallback(() => onPromote(member.user_id), [member.user_id, onPromote])

  return (
    <View style={styles.memberRow}>
      <Avatar name={member.nickname || member.email} size={32} />
      <Text style={styles.memberName} numberOfLines={1}>
        {member.nickname || member.email}
      </Text>
      {member.role === 'admin' && (
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeText}>{t('settings.admin')}</Text>
        </View>
      )}
      {isAdmin && !isSelf && !busy && (
        <View style={styles.memberActions}>
          {member.role !== 'admin' && (
            <Pressable onPress={handlePromote} hitSlop={8} accessibilityRole="button">
              <Text style={styles.memberActionText}>{t('settings.makeAdmin')}</Text>
            </Pressable>
          )}
          <Pressable onPress={handleRemove} hitSlop={8} accessibilityRole="button">
            <Text style={styles.memberActionTextDanger}>{t('common.remove')}</Text>
          </Pressable>
        </View>
      )}
      {isAdmin && !isSelf && busy && <ActivityIndicator size="small" />}
    </View>
  )
}

interface MembersListProps {
  loading: boolean
  members: MemberOut[]
  isAdmin: boolean
  currentUserId: string | undefined
  busyUserId: string | null
  onRemove: (userId: string) => void
  onPromote: (userId: string) => void
}

const MembersList = ({
  loading,
  members,
  isAdmin,
  currentUserId,
  busyUserId,
  onRemove,
  onPromote,
}: MembersListProps) => {
  if (loading) {
    return <ActivityIndicator style={styles.membersLoading} />
  }

  return (
    <>
      {members.map((m) => (
        <MemberRow
          key={m.user_id.toString()}
          member={m}
          isAdmin={isAdmin}
          isSelf={m.user_id === currentUserId}
          busy={busyUserId === m.user_id}
          onRemove={onRemove}
          onPromote={onPromote}
        />
      ))}
    </>
  )
}

const HouseholdDetailScreen = () => {
  const { id: householdId } = useLocalSearchParams<{ id: string; householdName?: string }>()
  const router = useRouter()
  const { t } = useTranslation()
  const { user, refreshUser } = useAuth()
  const { households, update, leave, invite, rotateCode } = useHouseholds()
  const { members, isLoading: membersLoading, remove, promote } = useMembers(householdId)
  const insets = useSafeAreaInsets()

  const household = households.find((h) => h.id === householdId)
  const [name, setName] = useState(household?.name ?? '')
  const [color, setColor] = useState(household?.color ?? PRESET_COLORS[0])
  const [inviteEmail, setInviteEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)

  const currentMember = members.find((m) => m.user_id === user?.id)
  const isAdmin = currentMember?.role === 'admin'

  const handleSave = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSaving(true)
    try {
      await update.mutateAsync({ id: householdId, data: { name: name.trim() || undefined, color } })
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.failedToSave'))
    } finally {
      setSaving(false)
    }
  }, [householdId, name, color, update, t])

  const isDirty = name.trim() !== (household?.name ?? '') || color !== (household?.color ?? PRESET_COLORS[0])

  const getPressableStyle = useCallback(
    (c: string) =>
      ({ pressed }: { pressed: boolean }) => [
        styles.colorDot,
        { backgroundColor: c },
        color === c && styles.colorDotSelected,
        pressed && { opacity: 0.7 },
      ],
    [color],
  )

  const handleInvite = useCallback(async () => {
    const email = inviteEmail.trim()
    if (!email) return
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setInviting(true)
    try {
      await invite.mutateAsync({ householdId, email })
      setInviteEmail('')
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(t('settings.invitationSent'))
    } catch (e) {
      Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.invitationFailed'))
    } finally {
      setInviting(false)
    }
  }, [householdId, inviteEmail, invite, t])

  const handleCopyCode = useCallback(async () => {
    if (!household) return
    await Clipboard.setStringAsync(household.invite_code)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }, [household])

  const handleRotateCode = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setRotating(true)
    try {
      await rotateCode.mutateAsync(householdId)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.failedToSave'))
    } finally {
      setRotating(false)
    }
  }, [householdId, rotateCode, t])

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      setBusyUserId(userId)
      try {
        await remove.mutateAsync(userId)
      } catch (e) {
        Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.failedToSave'))
      } finally {
        setBusyUserId(null)
      }
    },
    [remove, t],
  )

  const handlePromoteMember = useCallback(
    async (userId: string) => {
      setBusyUserId(userId)
      try {
        await promote.mutateAsync(userId)
      } catch (e) {
        Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.failedToSave'))
      } finally {
        setBusyUserId(null)
      }
    },
    [promote, t],
  )

  const handleLeaveOnPress = useCallback(async () => {
    setLeaving(true)
    try {
      await leave.mutateAsync(householdId)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      if (user?.active_household_id === householdId) {
        await refreshUser()
      }
      router.back()
    } catch (e) {
      setLeaving(false)
      Alert.alert(t('common.somethingWentWrong'), e instanceof Error ? e.message : t('settings.leaveFailed'))
    }
  }, [householdId, leave, user, refreshUser, router, t])

  const handleLeave = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.alert(t('settings.leaveHousehold'), t('settings.areYouSure'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.leaveHousehold'),
        style: 'destructive',
        onPress: handleLeaveOnPress,
      },
    ])
  }, [t, handleLeaveOnPress])

  const getLeaveRowStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.leaveRow, pressed && styles.leaveRowPressed],
    [],
  )

  if (!household) {
    if (leaving) return null
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('recipes.noResults')}</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: 48 + insets.bottom }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => <HeaderSaveButton saving={saving} isDirty={isDirty} onPress={handleSave} />,
        }}
      />
      <Text style={styles.sectionHeader}>{t('settings.nameLabel')}</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('settings.householdNamePlaceholder')}
          accessibilityLabel={t('settings.nameLabel')}
        />
      </View>

      <Text style={styles.sectionHeader}>{t('settings.colorLabel')}</Text>
      <View style={[styles.card, styles.colorRow]}>
        {PRESET_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)
              setColor(c)
            }}
            style={getPressableStyle(c)}
            accessibilityLabel={c}
            accessibilityRole="radio"
            accessibilityState={{ checked: color === c }}
          />
        ))}
      </View>

      <Text style={styles.sectionHeader}>{t('settings.inviteCode')}</Text>
      <View style={[styles.card, styles.inviteCodeRow]}>
        <Text style={styles.inviteCodeText}>{household.invite_code}</Text>
        <Pressable onPress={handleCopyCode} hitSlop={8} accessibilityRole="button">
          <Text style={styles.inviteBtnText}>{t('common.copy')}</Text>
        </Pressable>
        {isAdmin && (
          rotating ? (
            <ActivityIndicator size="small" />
          ) : (
            <Pressable onPress={handleRotateCode} hitSlop={8} accessibilityRole="button">
              <Text style={styles.inviteBtnText}>{t('settings.regenerate')}</Text>
            </Pressable>
          )
        )}
      </View>

      <Text style={styles.sectionHeader}>{t('settings.members')}</Text>
      <View style={styles.card}>
        <MembersList
          loading={membersLoading}
          members={members}
          isAdmin={isAdmin}
          currentUserId={user?.id}
          busyUserId={busyUserId}
          onRemove={handleRemoveMember}
          onPromote={handlePromoteMember}
        />
      </View>

      <Text style={styles.sectionHeader}>{t('settings.inviteByEmail')}</Text>
      <View style={styles.card}>
        <View style={styles.inviteRow}>
          <TextInput
            style={styles.inviteInput}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder={t('settings.inviteEmailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={handleInvite}
            accessibilityLabel={t('settings.inviteByEmail')}
          />
          {inviting ? (
            <ActivityIndicator style={styles.inviteSpinner} />
          ) : (
            <Pressable
              onPress={handleInvite}
              disabled={!inviteEmail.trim()}
              hitSlop={8}
              accessibilityLabel={t('common.invite')}
              accessibilityRole="button"
            >
              <Text style={[styles.inviteBtnText, !inviteEmail.trim() && styles.inviteBtnTextDisabled]}>
                {t('common.invite')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={[styles.card, styles.leaveSection]}>
        <Pressable
          style={getLeaveRowStyle}
          onPress={handleLeave}
          accessibilityLabel={t('settings.leaveHousehold')}
          accessibilityRole="button"
        >
          <Text style={styles.leaveBtnText}>{t('settings.leaveHousehold')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { color: colors.red, fontSize: 16 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondaryLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 10,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    overflow: 'hidden',
  },
  input: {
    fontSize: 16,
    color: colors.label,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  headerSaveBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  headerSaveText: { color: colors.blue, fontSize: 17, fontWeight: '600' },
  headerSaveTextDisabled: { color: colors.secondaryLabel, opacity: 0.5 },
  membersLoading: { padding: 12 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.secondaryBackground,
  },
  memberName: { flex: 1, fontSize: 16, color: colors.label },
  adminBadge: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.blue,
  },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberActionText: { fontSize: 14, fontWeight: '600', color: colors.blue },
  memberActionTextDanger: { fontSize: 14, fontWeight: '600', color: colors.red },
  inviteCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 16,
  },
  inviteCodeText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 2,
    color: colors.label,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  inviteInput: {
    flex: 1,
    fontSize: 16,
    color: colors.label,
    borderWidth: 1,
    borderColor: colors.opaqueSeparator,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  inviteSpinner: { marginRight: 4 },
  inviteBtnText: { fontSize: 16, fontWeight: '600', color: colors.blue },
  inviteBtnTextDisabled: { color: colors.secondaryLabel, opacity: 0.5 },
  leaveSection: { marginTop: 32 },
  leaveRow: {
    paddingVertical: 13,
    alignItems: 'center',
  },
  leaveRowPressed: { backgroundColor: colors.secondaryBackground },
  leaveBtnText: { color: colors.red, fontSize: 16, fontWeight: '400' },
})

export default HouseholdDetailScreen
